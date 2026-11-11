"""Local Faster-Whisper speech transcription for ULTRON's voice pipeline.

The Next.js transcription route invokes this module with a bounded temporary
audio file. Model inference runs on the local CPU; no audio is sent to a service.
"""

import json
import os
import sys
from pathlib import Path
from typing import Any, Optional


class EmptyAudioError(ValueError):
    """Raised when an audio file has no bytes to decode."""


class AudioDecodeError(ValueError):
    """Raised when the local audio decoder rejects the uploaded container."""


class NoSpeechDetectedError(ValueError):
    """Raised when valid audio contains no transcriptable speech."""


class TranscriptionDependencyError(RuntimeError):
    """Raised when Faster-Whisper is not installed in the selected Python runtime."""


class TranscriptionModelUnavailable(RuntimeError):
    """Raised when the local model cannot be loaded or downloaded."""


class TranscriptionFailure(RuntimeError):
    """Raised when model inference fails for a reason other than invalid audio."""


def _create_model() -> Any:
    """Loads a multilingual CPU model; model weights are cached on the local machine."""
    try:
        from faster_whisper import WhisperModel
    except ImportError as error:
        raise TranscriptionDependencyError from error

    model_name = os.environ.get("ULTRON_WHISPER_MODEL", "small").strip() or "small"
    model_directory = os.environ.get("ULTRON_WHISPER_MODEL_DIR")
    try:
        return WhisperModel(
            model_name,
            device="cpu",
            compute_type="int8",
            download_root=model_directory,
        )
    except Exception as error:
        raise TranscriptionModelUnavailable from error


def transcribe_audio_file(audio_path: os.PathLike[str] | str, model: Optional[Any] = None) -> str:
    """Transcribes one local audio file and refuses to return an empty success.

    Args:
        audio_path: Temporary audio file written by the bounded Next.js route.
        model: Optional injected model used by isolated tests.

    Returns:
        The joined transcript produced by Faster-Whisper.

    Raises:
        EmptyAudioError: When the input file does not exist or is empty.
        AudioDecodeError: When the audio decoder rejects the file.
        NoSpeechDetectedError: When valid audio contains no recognized speech.
        TranscriptionDependencyError: When Faster-Whisper is not installed.
        TranscriptionModelUnavailable: When local model loading fails.
        TranscriptionFailure: When inference itself fails.
    """
    path = Path(audio_path)
    if not path.is_file() or path.stat().st_size == 0:
        raise EmptyAudioError

    active_model = model if model is not None else _create_model()
    try:
        segments, _info = active_model.transcribe(
            str(path),
            task="transcribe",
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        transcript = " ".join(
            segment.text.strip()
            for segment in segments
            if isinstance(getattr(segment, "text", None), str) and segment.text.strip()
        ).strip()
    except Exception as error:
        # PyAV's decoder errors are distinct from inference failures and map to 422.
        if isinstance(error, AudioDecodeError) or error.__class__.__module__.startswith("av.") or error.__class__.__name__ in {
            "InvalidDataError",
            "DecodeError",
        }:
            raise AudioDecodeError from error
        raise TranscriptionFailure from error

    if not transcript:
        raise NoSpeechDetectedError
    return transcript


def _write_error(error_code: str, exit_code: int) -> None:
    """Writes a stable machine-readable error without exposing paths or audio data."""
    sys.stdout.write(json.dumps({"error": error_code}) + "\n")
    raise SystemExit(exit_code)


def main(argv: list[str]) -> int:
    """Runs the worker CLI used by the Next.js API route.

    Args:
        argv: Command-line arguments, excluding the executable and module name.

    Returns:
        A process exit code; nonzero codes describe explicit transcription failures.
    """
    if len(argv) != 1:
        _write_error("INVALID_REQUEST", 2)

    try:
        transcript = transcribe_audio_file(argv[0])
    except EmptyAudioError:
        _write_error("EMPTY_AUDIO", 2)
    except AudioDecodeError:
        _write_error("INVALID_AUDIO", 2)
    except NoSpeechDetectedError:
        _write_error("NO_SPEECH", 3)
    except TranscriptionDependencyError:
        _write_error("STT_ENGINE_UNAVAILABLE", 4)
    except TranscriptionModelUnavailable:
        _write_error("STT_MODEL_UNAVAILABLE", 4)
    except TranscriptionFailure:
        _write_error("TRANSCRIPTION_FAILED", 5)

    sys.stdout.write(json.dumps({"text": transcript}, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

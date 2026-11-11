"""Unit tests for local audio decoding and Faster-Whisper result handling."""

import tempfile
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace

from ultron_engine.voice_transcription import (
    AudioDecodeError,
    EmptyAudioError,
    NoSpeechDetectedError,
    TranscriptionFailure,
    transcribe_audio_file,
)


class StubModel:
    """Deterministic model double for exercising audio validation without downloads."""

    def __init__(self, segments=None, error=None):
        self.segments = segments or []
        self.error = error
        self.input_path = None

    def transcribe(self, audio_path, **_options):
        self.input_path = audio_path
        if self.error:
            raise self.error
        return iter(self.segments), SimpleNamespace(language="en")


class LocalTranscriptionTests(unittest.TestCase):
    """Verify valid containers, empty/corrupt audio, and inference failures."""

    def make_wav(self, path):
        with wave.open(str(path), "wb") as audio_file:
            audio_file.setnchannels(1)
            audio_file.setsampwidth(2)
            audio_file.setframerate(16000)
            audio_file.writeframes(b"\x00\x00" * 1600)

    def test_valid_audio_returns_injected_model_segments(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            audio_path = Path(temp_dir, "valid.wav")
            self.make_wav(audio_path)
            model = StubModel([SimpleNamespace(text=" Hello ULTRON ")])
            self.assertEqual(transcribe_audio_file(audio_path, model=model), "Hello ULTRON")
            self.assertEqual(model.input_path, str(audio_path))

    def test_empty_audio_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            audio_path = Path(temp_dir, "empty.wav")
            audio_path.touch()
            with self.assertRaises(EmptyAudioError):
                transcribe_audio_file(audio_path, model=StubModel())

    def test_corrupted_audio_is_reported_as_decode_error(self):
        class InvalidDataError(Exception):
            __module__ = "av.error"

        with tempfile.TemporaryDirectory() as temp_dir:
            audio_path = Path(temp_dir, "corrupt.wav")
            audio_path.write_bytes(b"not an audio stream")
            with self.assertRaises(AudioDecodeError):
                transcribe_audio_file(audio_path, model=StubModel(error=InvalidDataError()))

    def test_silence_does_not_return_success_shaped_empty_transcript(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            audio_path = Path(temp_dir, "silence.wav")
            self.make_wav(audio_path)
            with self.assertRaises(NoSpeechDetectedError):
                transcribe_audio_file(audio_path, model=StubModel())

    def test_inference_failure_is_explicit(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            audio_path = Path(temp_dir, "valid.wav")
            self.make_wav(audio_path)
            with self.assertRaises(TranscriptionFailure):
                transcribe_audio_file(audio_path, model=StubModel(error=RuntimeError("model failed")))


if __name__ == "__main__":
    unittest.main(verbosity=2)

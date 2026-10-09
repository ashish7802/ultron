import soundfile as sf
import numpy as np
import io
import os
import time
from faster_whisper import WhisperModel

print("Loading Whisper tiny model...")
model = WhisperModel("tiny", device="cpu", compute_type="int8")

# Generate 2 seconds of 440Hz sine wave audio (speech sound simulation)
sr = 16000
t = np.linspace(0, 2, 2 * sr, endpoint=False)
audio_data = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

wav_io = io.BytesIO()
sf.write(wav_io, audio_data, sr, format='WAV')
wav_bytes = wav_io.getvalue()

print(f"Generated WAV bytes length: {len(wav_bytes)}")

# Save to temp WAV file and test transcribe
with open("test_speech.wav", "wb") as f:
    f.write(wav_bytes)

t0 = time.time()
segments, info = model.transcribe("test_speech.wav", beam_size=1)
text = " ".join([s.text.strip() for s in segments])
print(f"Transcribed WAV in {time.time()-t0:.2f}s: '{text}'")

if os.path.exists("test_speech.wav"):
    os.remove("test_speech.wav")


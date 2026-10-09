from faster_whisper import WhisperModel
import time
import numpy as np
import soundfile as sf
import os

print("Loading tiny whisper model...")
t0 = time.time()
model = WhisperModel("tiny", device="cpu", compute_type="int8")
print(f"Model loaded in {time.time() - t0:.2f}s")

# Create a 1-second silence/test audio
audio_data = np.zeros(16000, dtype=np.float32)
sf.write("test.wav", audio_data, 16000)

t0 = time.time()
segments, info = model.transcribe("test.wav", beam_size=1)
text = "".join([segment.text for segment in segments])
print(f"Transcribed test in {time.time() - t0:.2f}s: '{text}'")

if os.path.exists("test.wav"):
    os.remove("test.wav")


import soundfile as sf
import numpy as np
import urllib.request
import json
import io
import time

print("Creating 16kHz PCM WAV audio of 1-second 440Hz tone...")
sr = 16000
t = np.linspace(0, 1.5, int(1.5 * sr), endpoint=False)
# Generate a simple audio signal
samples = (0.3 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

wav_io = io.BytesIO()
sf.write(wav_io, samples, sr, format='WAV', subtype='PCM_16')
wav_bytes = wav_io.getvalue()

print(f"Sending {len(wav_bytes)} bytes WAV to http://127.0.0.1:5001/transcribe ...")
t0 = time.time()
req = urllib.request.Request(
    "http://127.0.0.1:5001/transcribe",
    data=wav_bytes,
    headers={"Content-Type": "audio/wav"}
)

try:
    res = urllib.request.urlopen(req)
    data = json.loads(res.read().decode('utf-8'))
    print(f"STT Server responded in {time.time()-t0:.2f}s: {data}")
except Exception as e:
    print("Error:", e)


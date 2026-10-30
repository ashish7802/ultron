"""ULTRON Native Hardware Voice Testing Tool.
Records live audio from your microphone or earbuds, transcribes speech,
sends it to the local ULTRON Qwen backend, and speaks the response aloud using native Windows TTS.
"""

import sys, time, json
import speech_recognition as sr
import pyttsx3
import urllib.request

print("=====================================================")
print("      ULTRON HARDWARE VOICE TEST UTILITY             ")
print("=====================================================")

# Initialize Text-To-Speech engine (Windows SAPI5)
tts = pyttsx3.init()
tts.setProperty('rate', 175)

def speak(text):
    print(f"\n[ULTRON VOICE]: {text}")
    tts.say(text)
    tts.runAndWait()

# Initialize Speech Recognizer
r = sr.Recognizer()
r.energy_threshold = 300
r.dynamic_energy_threshold = True

print("\nScanning audio input devices...")
mic_names = sr.Microphone.list_microphone_names()
for idx, name in enumerate(mic_names):
    if any(k in name.lower() for k in ["intel", "realtek", "headset", "microphone", "mapper"]):
        print(f"  [{idx}] {name}")

print("
Scanning for connected earbuds or headphones...")
headset_idx = None
for idx, name in enumerate(mic_names):
    l = name.lower()
    if any(k in l for k in ["headset", "headphone", "earbud", "bluetooth", "airpod", "buds", "tws", "hands-free", "mic input"]):
        headset_idx = idx
        break

if headset_idx is None:
    print("
[BLOCKED] Earbuds/Headphones NOT detected! Built-in laptop mic is rejected by user policy.")
    speak("Please connect your earbuds or headphones to talk to ULTRON.")
    sys.exit(0)

print(f"
[ACTIVE] Connected Earbuds/Headset Device [{headset_idx}]: {mic_names[headset_idx]}")
with sr.Microphone(device_index=headset_idx) as source:
    print("
Calibrating earbuds audio (1 sec)...")
    r.adjust_for_ambient_noise(source, duration=0.8)
    print(f"Calibrated noise floor: {r.energy_threshold:.1f}")
    speak("ULTRON voice system is online. Please speak into your microphone or earbuds.")

    while True:
        try:
            print("\n>>> LISTENING... (Speak now or press Ctrl+C to stop)")
            audio = r.listen(source, timeout=8, phrase_time_limit=10)

            print("Processing audio...")
            text = r.recognize_google(audio)
            print(f">>> [YOU SAID]: {text}")

            # Send to local ULTRON Next.js / Ollama Qwen backend
            req_data = json.dumps({
                "messages": [{"role": "user", "content": text}],
                "activationMode": "CONTINUOUS_CONVERSATION"
            }).encode('utf-8')

            req = urllib.request.Request(
                "http://localhost:3000/api/chat",
                data=req_data,
                headers={"Content-Type": "application/json"}
            )

            with urllib.request.urlopen(req, timeout=10) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                reply = res.get("reply", "")

            if reply:
                speak(reply)
            else:
                speak("I heard you, but no response was generated.")

        except sr.WaitTimeoutError:
            print("[Info] No speech detected in 8 seconds. Still listening...")
        except sr.UnknownValueError:
            print("[Notice] Speech was detected but could not be understood clearly.")
        except KeyboardInterrupt:
            speak("Voice test terminated. Goodbye.")
            break
        except Exception as e:
            print(f"[Error] {e}")


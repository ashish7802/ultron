import comtypes
from comtypes import CLSCTX_ALL
from pycaw.pycaw import IAudioEndpointVolume, IMMDeviceEnumerator
from ctypes import cast, POINTER

CLSID_MMDeviceEnumerator = comtypes.GUID('{BCDE0395-E52F-467C-8E3D-C4579291692E}')
IID_IMMDeviceEnumerator = comtypes.GUID('{A95664D2-9614-4F35-A746-DE8DB63617E6}')

enumerator = comtypes.CoCreateInstance(
    CLSID_MMDeviceEnumerator,
    IMMDeviceEnumerator,
    CLSCTX_ALL
)

# DEVICE_STATE_ACTIVE = 1
collection = enumerator.EnumAudioEndpoints(1, 1)
count = collection.GetCount()
print(f"Total Active Capture Endpoints: {count}")

for i in range(count):
    dev = collection.Item(i)
    dev_id = dev.GetId()
    vol_interface = dev.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
    vol_ctrl = cast(vol_interface, POINTER(IAudioEndpointVolume))
    muted = vol_ctrl.GetMute()
    vol = vol_ctrl.GetMasterVolumeLevelScalar()
    print(f"\nCapture Device #{i}: ID={dev_id}")
    print(f"  Muted: {muted}, Volume: {vol*100:.1f}%")
    if muted:
        print("  -> Unmuting device...")
        vol_ctrl.SetMute(0, None)
        print("  -> Unmuted!")
    if vol < 0.9:
        print("  -> Setting volume to 100%...")
        vol_ctrl.SetMasterVolumeLevelScalar(1.0, None)


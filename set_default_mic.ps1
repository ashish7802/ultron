$source = @"
using System;
using System.Runtime.InteropServices;

namespace AudioPolicy
{
    [Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IPolicyConfig
    {
        [PreserveSig] int GetMixFormat();
        [PreserveSig] int GetDeviceFormat();
        [PreserveSig] int ResetDeviceFormat();
        [PreserveSig] int SetDeviceFormat();
        [PreserveSig] int GetProcessingPeriod();
        [PreserveSig] int SetProcessingPeriod();
        [PreserveSig] int GetShareMode();
        [PreserveSig] int SetShareMode();
        [PreserveSig] int GetPropertyValue();
        [PreserveSig] int SetPropertyValue();
        [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string wszDeviceId, uint eRole);
        [PreserveSig] int SetEndpointVisibility();
    }

    [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")]
    internal class CPolicyConfigClient { }

    public class AudioSwitcher
    {
        public static int SetDefault(string deviceId)
        {
            var policy = (IPolicyConfig)new CPolicyConfigClient();
            int r0 = policy.SetDefaultEndpoint(deviceId, 0); // eConsole
            int r1 = policy.SetDefaultEndpoint(deviceId, 1); // eMultimedia
            int r2 = policy.SetDefaultEndpoint(deviceId, 2); // eCommunications
            return (r0 == 0 && r1 == 0 && r2 == 0) ? 0 : 1;
        }
    }
}
"@

Add-Type -TypeDefinition $source -Language CSharp
$intel_sst_id = "{0.0.1.00000000}.{1e95d1cc-e978-49a3-ada6-2000f1d67dda}"
$res = [AudioPolicy.AudioSwitcher]::SetDefault($intel_sst_id)
Write-Output "SetDefault Result: $res"


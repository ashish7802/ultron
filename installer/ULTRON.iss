#define AppName "ULTRON"
#define AppVersion "1.0.0"
#define AppPublisher "ULTRON"
#define AppExeName "ULTRON.exe"
#define PayloadDir "payload"
#define SignToolPath GetEnv("ULTRON_SIGNTOOL")
#define SignCertSha1 GetEnv("ULTRON_SIGN_CERT_SHA1")
#define TimestampUrl GetEnv("ULTRON_TIMESTAMP_URL")

[Setup]
AppId={{B73C490A-24E2-4EF9-B5F9-AC7F7B29DBF5}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\ULTRON
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
UninstallDisplayIcon={app}\{#AppExeName}
OutputDir=output
OutputBaseFilename=ULTRON-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
SignTool=ULTRON
SignedUninstaller=yes

[SignTools]
Name: "ULTRON"; Command: """{#SignToolPath}"" sign /s My /sha1 {#SignCertSha1} /fd SHA256 /tr {#TimestampUrl} /td SHA256 /d ""ULTRON"" $f"; VerifyCmd: """{#SignToolPath}"" verify /pa /all $f"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "{#PayloadDir}\launcher\ULTRON\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PayloadDir}\server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PayloadDir}\node\node.exe"; DestDir: "{app}\node"; Flags: ignoreversion
Source: "{#PayloadDir}\stt_server\*"; DestDir: "{app}\stt_server"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "Pin-Taskbar.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\ULTRON"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\ULTRON"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\Pin-Taskbar.ps1"""; Flags: runhidden waituntilterminated postinstall skipifsilent
Filename: "{app}\{#AppExeName}"; Description: "Launch ULTRON"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: files; Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\ULTRON.lnk"

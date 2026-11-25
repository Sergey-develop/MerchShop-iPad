"""Build an iPadOS IPA for signing with Sideloadly."""
import argparse
import os
import plistlib
import struct
import subprocess
import tempfile
import zipfile
from pathlib import Path


ios = Path(__file__).resolve().parent
project = ios.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
parser.add_argument("--executable", type=Path, help="Use an already compiled arm64 iOS executable")
args = parser.parse_args()
subprocess.run(["npm.cmd" if os.name == "nt" else "npm", "run", "build", "--", "--target", "safari16.4"],
               cwd=project, check=True)

with tempfile.TemporaryDirectory() as temporary:
    exe = args.executable or Path(temporary) / "MerchShop"
    if args.executable is None:
        subprocess.run(["xcrun", "--sdk", "iphoneos", "clang", "-target", "arm64-apple-ios16.4",
                        "-O2", "-fobjc-arc", str(ios / "main.m"), "-framework", "UIKit",
                        "-framework", "Foundation", "-framework", "WebKit", "-framework",
                        "CoreGraphics", "-Wl,-adhoc_codesign", "-o", str(exe)], check=True)
    if struct.unpack_from("<4I", exe.read_bytes())[:2] != (0xfeedfacf, 0x0100000c):
        raise ValueError("Expected an arm64 Mach-O executable")
    info = plistlib.loads((ios / "Info.plist").read_bytes())
    contents = {info["CFBundleExecutable"]: exe, "Info.plist": ios / "Info.plist"}
    contents.update({icon.name: icon for icon in ios.glob("AppIcon*.png")})
    web = project / "dist"
    contents.update({"www/" + f.relative_to(web).as_posix(): f for f in web.rglob("*") if f.is_file()})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, "w") as archive:
        for name, source in contents.items():
            entry = zipfile.ZipInfo("Payload/MerchShop.app/" + name)
            entry.create_system = 3
            entry.external_attr = (0o100755 if source == exe else 0o100644) << 16
            archive.writestr(entry, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED,
                             compresslevel=6)
print(args.output.resolve())

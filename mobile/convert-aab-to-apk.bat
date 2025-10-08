@echo off
echo Converting AAB to APK...
echo.
echo Steps:
echo 1. Download bundletool-all.jar from: https://github.com/google/bundletool/releases
echo 2. Download your .aab file from EAS build dashboard
echo 3. Place both files in this directory
echo 4. Run this script
echo.

if not exist "bundletool-all-*.jar" (
    echo ERROR: bundletool-all-*.jar not found!
    echo Please download it from: https://github.com/google/bundletool/releases
    pause
    exit /b 1
)

if not exist "*.aab" (
    echo ERROR: No .aab file found!
    echo Please download your .aab file from EAS build dashboard and place it here
    pause
    exit /b 1
)

echo Found bundletool and AAB file. Converting...
java -jar bundletool-all-*.jar build-apks --bundle=*.aab --output=app.apks --mode=universal

if exist "app.apks" (
    echo.
    echo SUCCESS! Extracting APK...
    java -jar bundletool-all-*.jar extract-apks --apks=app.apks --output-dir=extracted-apks
    echo.
    echo APK file ready! Check the extracted-apks folder for your .apk file
) else (
    echo ERROR: Conversion failed!
)

pause

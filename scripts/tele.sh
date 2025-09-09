#!/bin/bash

# Pastikan dua parameter diberikan
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <PASSWORD> <IMG_VERSION>"
    echo "Available img_version: win_10, win_22, win_19, win_12"
    echo "Or provide a direct image URL (must end with .gz)"
    exit 1
fi

PASSWORD=$1
IMG_VERSION=$2

# Cek apakah IMG_VERSION adalah URL langsung
if [[ "$IMG_VERSION" =~ ^https?://.*\.gz$ ]]; then
    IMG_URL="$IMG_VERSION"
else
    # Mapping img_version ke URL
    case $IMG_VERSION in
        win_10)
            IMG_URL="https://img.naya.my.id/win10.gz"
            ;;
        win_22)
            IMG_URL="https://img.naya.my.id/windows2022.gz"
            ;;
        win_19)
            IMG_URL="https://img.naya.my.id/win2019.gz"
            ;;
        win_12)
            IMG_URL="https://img.naya.my.id/windows2012.gz"
            ;;
        *)
            echo "Invalid img_version or unsupported URL format."
            echo "Use one of: win_10, win_22, win_19, win_12"
            echo "Or provide a direct .gz URL"
            exit 1
            ;;
    esac
fi

echo "Starting Dedicated RDP installation..."
echo "OS: $IMG_VERSION"
echo "Image URL: $IMG_URL"

# Download reinstall.sh menggunakan curl atau wget
echo "Downloading reinstall.sh..."
curl -O https://raw.githubusercontent.com/kripul/reinstall/main/reinstall.sh || \
wget -O reinstall.sh https://raw.githubusercontent.com/kripul/reinstall/main/reinstall.sh

if [ ! -f "reinstall.sh" ]; then
    echo "Failed to download reinstall.sh"
    exit 1
fi

# Berikan izin eksekusi pada reinstall.sh
chmod +x reinstall.sh

echo "Running reinstall.sh with parameters..."
# Jalankan reinstall.sh dengan parameter yang diberikan
bash reinstall.sh dd \
    --rdp-port 8765 \
    --password "$PASSWORD" \
    --img "$IMG_URL"

# Check if installation was successful
if [ $? -eq 0 ]; then
    echo "Installation completed successfully!"
    echo "RDP will be available on port 8765"
    echo "Username: administrator"
    echo "Password: $PASSWORD"
    
    # Reboot sistem setelah instalasi selesai
    echo "Rebooting system in 5 seconds..."
    sleep 5
    reboot
else
    echo "Installation failed!"
    exit 1
fi

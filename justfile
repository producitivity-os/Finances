set shell := ["zsh", "-cu"]

default:
    @just --list

generate:
    xcodegen generate

build: generate
    mkdir -p .build/xcode
    xcodebuild -project Finances.xcodeproj -scheme Finances -configuration Debug -destination "platform=macOS,arch=$(uname -m)" -derivedDataPath .build/xcode build

test: generate
    mkdir -p .build/xcode
    xcodebuild -project Finances.xcodeproj -scheme Finances -configuration Debug -destination "platform=macOS,arch=$(uname -m)" -derivedDataPath .build/xcode test

open:
    open -n -F .build/xcode/Build/Products/Debug/Finances.app

run: build
    just open

release: generate
    mkdir -p .build/xcode
    xcodebuild -project Finances.xcodeproj -scheme Finances -configuration Release -destination "platform=macOS,arch=$(uname -m)" -derivedDataPath .build/xcode build

icons:
    zsh Tools/fetch-lucide-icons.sh


update-icon picture:
    zsh Tools/update-app-icon.sh "{{picture}}"

install: release
    mkdir -p ~/Applications
    rm -rf ~/Applications/Notes.app
    cp -R .build/xcode/Build/Products/Release/Notes.app ~/Applications/Notes.app

set shell := ["zsh", "-cu"]

default:
    @just --list

generate:
    xcodegen generate

build-macos: generate
    xcodebuild -project Finances.xcodeproj -scheme Finances -configuration Debug -destination "platform=macOS,arch=$(uname -m)" -derivedDataPath .build/xcode build CODE_SIGNING_ALLOWED=NO

test-macos: generate
    xcodebuild -project Finances.xcodeproj -scheme Finances -configuration Debug -destination "platform=macOS,arch=$(uname -m)" -derivedDataPath .build/xcode test CODE_SIGNING_ALLOWED=NO

run-macos: build-macos
    ../../tools/apple-app.sh run-macos "$PWD" Finances com.productivitysuite.finances

install-macos: release-macos
    ../../tools/apple-app.sh install-macos "$PWD" Finances com.productivitysuite.finances

release-macos: generate
    xcodebuild -project Finances.xcodeproj -scheme Finances -configuration Release -destination "platform=macOS,arch=$(uname -m)" -derivedDataPath .build/xcode build CODE_SIGNING_ALLOWED=NO

build-sim: generate
    ../../tools/apple-app.sh build-sim "$PWD" Finances FinancesIOS com.productivitysuite.finances.ios

test-sim: generate
    ../../tools/apple-app.sh test-sim "$PWD" Finances FinancesIOS com.productivitysuite.finances.ios

run-sim: generate
    ../../tools/apple-app.sh run-sim "$PWD" Finances FinancesIOS com.productivitysuite.finances.ios

build-device: generate
    ../../tools/apple-app.sh build-device "$PWD" Finances FinancesIOS com.productivitysuite.finances.ios

install-device: generate
    ../../tools/apple-app.sh install-device "$PWD" Finances FinancesIOS com.productivitysuite.finances.ios

run-device: generate
    ../../tools/apple-app.sh run-device "$PWD" Finances FinancesIOS com.productivitysuite.finances.ios

update-icon picture:
    Tools/update-app-icon.sh "{{picture}}"

icons:
    @echo "Lucide icons are bundled by packages/ProductivityUI"

build: build-macos
test: test-macos
run: run-macos
release: release-macos

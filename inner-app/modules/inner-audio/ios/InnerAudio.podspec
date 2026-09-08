require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))
Pod::Spec.new do |s|
  s.name = 'InnerAudio'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = package['license']
  s.author = 'Inner'
  s.homepage = 'https://getinner.app'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.4'
  s.source = { :git => 'https://github.com/expo/expo.git' }
  s.static_framework = true
  s.source_files = '**/*.{h,m,swift}'
  s.dependency 'ExpoModulesCore'
end

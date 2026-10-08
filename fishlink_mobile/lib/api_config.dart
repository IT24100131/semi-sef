import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class ApiConfig {
  static const _storage = FlutterSecureStorage();
  static const String _storageKey = 'custom_api_url';

  // Android Emulator host PC IP: 10.0.2.2:5157 (Physical device uses PC LAN IP)
  static const String defaultHost = '10.0.2.2:5157';

  static String _customUrl = '';

  static Future<void> init() async {
    try {
      final saved = await _storage.read(key: _storageKey);
      if (saved != null && saved.trim().isNotEmpty) {
        _customUrl = saved.trim().replaceAll(RegExp(r'/+$'), '');
      }
    } catch (_) {}
  }

  static String get effectiveApiBaseUrl {
    if (_customUrl.isNotEmpty) {
      return _customUrl;
    }
    const envUrl = String.fromEnvironment('FISHLINK_API_URL');
    if (envUrl.isNotEmpty) {
      return envUrl;
    }
    if (kIsWeb) {
      return 'http://localhost:5157/api';
    }
    // For physical Android device / emulator
    return 'http://$defaultHost/api';
  }

  static Future<void> setCustomUrl(String url) async {
    final cleaned = url.trim().replaceAll(RegExp(r'/+$'), '');
    _customUrl = cleaned;
    try {
      if (cleaned.isEmpty) {
        await _storage.delete(key: _storageKey);
      } else {
        await _storage.write(key: _storageKey, value: cleaned);
      }
    } catch (_) {}
  }

  static Future<Map<String, dynamic>> testConnection([String? testUrl]) async {
    final target = (testUrl != null && testUrl.trim().isNotEmpty)
        ? testUrl.trim().replaceAll(RegExp(r'/+$'), '')
        : effectiveApiBaseUrl;

    try {
      // Try root health endpoint or /health
      final rootUri = Uri.parse(target);
      final healthUri = Uri(
        scheme: rootUri.scheme,
        host: rootUri.host,
        port: rootUri.port,
        path: '/health',
      );

      final response = await http
          .get(healthUri)
          .timeout(const Duration(seconds: 4));

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return {
          'success': true,
          'message': 'Connected to FishLink Backend (${response.body.trim()})',
        };
      } else {
        return {
          'success': false,
          'message': 'Server responded with HTTP ${response.statusCode}',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Connection failed: ${e.toString().split('\n').first}',
      };
    }
  }
}

// Global top-level getter for backward compatibility
String get effectiveApiBaseUrl => ApiConfig.effectiveApiBaseUrl;

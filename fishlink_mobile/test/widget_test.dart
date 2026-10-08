import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fishlink_mobile/main.dart';

void main() {
  group('FishLink Mobile App Widget & Form Validation Tests', () {
    testWidgets('Login screen validates required fields on submit', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(const FishLinkApp());
      await tester.pumpAndSettle();

      // Verify branding and login form elements
      expect(find.text('Sign in to your account'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Login'), findsOneWidget);

      // Tap Login button without entering fields
      await tester.tap(find.widgetWithText(FilledButton, 'Login'));
      await tester.pumpAndSettle();

      // Validation errors should appear
      expect(find.text('Enter a valid email'), findsOneWidget);
      expect(find.text('Minimum 6 characters'), findsOneWidget);
    });

    testWidgets('Register screen navigation and role selector works', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(const FishLinkApp());
      await tester.pumpAndSettle();

      // Tap create account
      await tester.tap(find.text('Create an account'));
      await tester.pumpAndSettle();

      // Verify register screen elements
      expect(find.text('Create an Account'), findsOneWidget);
      expect(find.text('Full Name'), findsOneWidget);
      expect(find.text('Email Address'), findsOneWidget);
      expect(find.text('Select Your Role'), findsOneWidget);

      // Verify register submit validation
      await tester.tap(find.widgetWithText(FilledButton, 'Register'));
      await tester.pumpAndSettle();
      expect(find.text('Enter your name'), findsOneWidget);
    });

    testWidgets('New Catch form validates quantity and price fields', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData(useMaterial3: true),
          home: const Scaffold(body: NewCatchScreen()),
        ),
      );
      await tester.pumpAndSettle();

      // Verify catch form header & fields
      expect(find.text('Register New Catch'), findsOneWidget);
      expect(find.text('Fish Species'), findsOneWidget);
      expect(find.text('Quantity (kg)'), findsOneWidget);
      expect(find.text('Asking Price (Rs/kg)'), findsOneWidget);
      expect(find.text('Quality & Inspection Details'), findsOneWidget);

      // Scroll down by dragging ListView
      await tester.drag(find.byType(ListView), const Offset(0, -600));
      await tester.pumpAndSettle();

      // Tap Save Draft
      final draftBtn = find.widgetWithText(OutlinedButton, '📋 Save Draft');
      expect(draftBtn, findsOneWidget);
      await tester.tap(draftBtn);
      await tester.pumpAndSettle();

      // Quantity validation error should appear
      expect(find.text('Enter valid kg'), findsOneWidget);
      expect(find.text('Enter valid price'), findsOneWidget);
    });

    testWidgets('MyCatchesScreen displays filter chips and UI elements', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData(useMaterial3: true),
          home: const Scaffold(body: MyCatchesScreen()),
        ),
      );
      // Pump initial frame and settle timers
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));

      // Verify filter chips exist
      expect(find.text('All'), findsOneWidget);
      expect(find.text('Draft'), findsOneWidget);
      expect(find.text('Published'), findsOneWidget);
      expect(find.text('Bidding'), findsOneWidget);
      expect(find.text('Sold'), findsOneWidget);
      expect(find.text('Log Catch'), findsOneWidget);
    });

    test('effectiveApiBaseUrl returns valid URI', () {
      final url = effectiveApiBaseUrl;
      expect(url.isNotEmpty, isTrue);
      expect(url.startsWith('http://'), isTrue);
      expect(url.endsWith('/api'), isTrue);
    });
  });
}

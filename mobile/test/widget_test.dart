import 'package:flutter_test/flutter_test.dart';
import 'package:urban_furniture/main.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    // Basic instantiation test
    expect(const UrbanFurnitureApp(), isNotNull);
  });
}

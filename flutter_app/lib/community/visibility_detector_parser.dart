import 'package:flutter/material.dart';
import 'package:visibility_detector/visibility_detector.dart';
import 'package:fuickjs_flutter/core/container/fuick_action.dart';
import 'package:fuickjs_flutter/core/container/fuick_app_controller.dart';
import 'package:fuickjs_flutter/core/widgets/widget_factory.dart';
import 'package:fuickjs_flutter/core/widgets/parsers/widget_parser.dart';

class VisibilityDetectorParser extends WidgetParser {
  @override
  String get type => 'VisibilityDetector';

  @override
  Widget parse(BuildContext context, Map<String, dynamic> props,
      dynamic children, WidgetFactory factory) {
    // VisibilityDetector 需要唯一 Key。优先用用户显式传入的 refId / key，
    // 否则用 nodeId（同一 DSL 节点稳定）兜底，最后才 UniqueKey。
    final keyStr = props['refId'] ?? props['key'] ?? props['id']?.toString();
    final Key widgetKey =
        keyStr != null ? Key(keyStr.toString()) : UniqueKey();

    // Capture the controller to use it in the callback even if the widget is unmounted.
    final controller = FuickAppScope.of(context);

    return VisibilityDetector(
      key: widgetKey,
      onVisibilityChanged: (VisibilityInfo info) {
        if (props['onVisibilityChanged'] != null) {
          FuickAction.event(context, props['onVisibilityChanged'],
              value: {
                'visibleFraction': info.visibleFraction,
                'size': {'width': info.size.width, 'height': info.size.height},
                'visibleBounds': {
                  'left': info.visibleBounds.left,
                  'top': info.visibleBounds.top,
                  'width': info.visibleBounds.width,
                  'height': info.visibleBounds.height,
                }
              },
              controller: controller);
        }
      },
      child: factory.buildFirstChild(context, children, type),
    );
  }
}

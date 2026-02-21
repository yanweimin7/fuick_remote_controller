import 'package:flutter/material.dart';
import 'package:fuickjs_flutter/core/widgets/parsers/widget_parser.dart';
import 'package:fuickjs_flutter/core/widgets/widget_factory.dart';
import 'rtc_video_view_wrapper.dart';

class RTCVideoViewParser extends WidgetParser {
  @override
  String get type => 'RTCVideoView';

  @override
  Widget parse(BuildContext context, Map<String, dynamic> props, dynamic children, WidgetFactory factory) {
    return RTCVideoViewWrapper(props: props);
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../services/webrtc_service.dart';

class RTCVideoViewWrapper extends StatefulWidget {
  final Map<String, dynamic> props;
  const RTCVideoViewWrapper({super.key, required this.props});

  @override
  State<RTCVideoViewWrapper> createState() => _RTCVideoViewWrapperState();
}

class _RTCVideoViewWrapperState extends State<RTCVideoViewWrapper> {
  final RTCVideoRenderer _renderer = RTCVideoRenderer();
  bool _hasStream = false;
  MediaStream? _remoteStream;
  bool _isRendererInitialized = false;

  @override
  void initState() {
    super.initState();
    _initRenderer();

    // Listen for stream updates
    WebRTCService().setOnRemoteStream((stream) {
      if (mounted) {
        setState(() {
          _remoteStream = stream;
          _hasStream = true;
          if (_isRendererInitialized) {
            _renderer.srcObject = stream;
          }
        });
      }
    });
  }

  void _checkStream() {
    final stream = WebRTCService().remoteStream;
    if (stream != null) {
      setState(() {
        _remoteStream = stream;
        _hasStream = true;
        if (_isRendererInitialized) {
          _renderer.srcObject = stream;
        }
      });
    }
  }

  Future<void> _initRenderer() async {
    await _renderer.initialize();
    if (mounted) {
      setState(() {
        _isRendererInitialized = true;
      });
      _checkStream();
    }
  }

  @override
  void dispose() {
    _renderer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_hasStream || _remoteStream == null) {
      // Return transparent container if no stream
      return Container(color: Colors.transparent);
    }

    // Get objectFit from props, default to contain
    RTCVideoViewObjectFit objectFit =
        RTCVideoViewObjectFit.RTCVideoViewObjectFitContain;
    if (widget.props['objectFit'] == 'cover') {
      objectFit = RTCVideoViewObjectFit.RTCVideoViewObjectFitCover;
    }

    return RTCVideoView(
      _renderer,
      objectFit: objectFit,
      mirror: widget.props['mirror'] == true,
    );
  }
}

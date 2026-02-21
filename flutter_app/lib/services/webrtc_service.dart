import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:fuickjs_flutter/core/service/base_fuick_service.dart';
import 'package:fuickjs_flutter/core/service/native_event_service.dart';
import 'package:fuickjs_flutter/core/service/native_services.dart';

import 'control_service.dart';
import 'screen_capture_service.dart';

typedef SignalingCallback = void Function(Map<String, dynamic> data);

class WebRTCService extends BaseFuickService {
  static final WebRTCService _instance = WebRTCService._internal();
  factory WebRTCService() => _instance;
  @override
  String get name => 'WebRTC';

  RTCPeerConnection? _peerConnection;
  RTCDataChannel? _dataChannel;
  MediaStream? _localStream;
  MediaStream? _remoteStream;

  MediaStream? get remoteStream => _remoteStream;

  SignalingCallback? _onSignal;
  void Function(MediaStream)? _onRemoteStream;
  void Function()? _onDataChannelOpen;
  bool _isCaller = false;
  bool _isController = false;
  String? _captureMode;

  // Cache for incoming chunks
  final Map<String, List<String?>> _chunkCache = {};

  // Queue for remote candidates received before RemoteDescription is set
  final List<RTCIceCandidate> _candidateQueue = [];

  // Configuration
  final Map<String, dynamic> _config = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
      {'urls': 'stun:stun2.l.google.com:19302'},
      {'urls': 'stun:stun3.l.google.com:19302'},
      {'urls': 'stun:stun4.l.google.com:19302'},
    ],
    'sdpSemantics': 'unified-plan',
  };

  final Map<String, dynamic> _constraints = {
    'mandatory': {
      'OfferToReceiveAudio': false,
      'OfferToReceiveVideo': true,
    },
    'optional': [],
  };

  WebRTCService._internal() {
    registerAsyncMethod('startCall', (args) async {
      final isCaller = args['isCaller'] == true;
      final captureMode = args['captureMode'] as String?;
      await startCall(isCaller, captureMode: captureMode);
      return true;
    });

    registerAsyncMethod('stopCall', (args) async {
      await stopCall();
      return true;
    });

    registerAsyncMethod('handleSignal', (args) async {
      final data = args['data'];
      await handleSignal(data);
      return true;
    });

    registerAsyncMethod('sendControlData', (args) async {
      final data = args['data'];
      return await sendControlData(data);
    });
  }

  void register() {
    NativeServiceManager().registerService(() => this);
  }

  void setSignalingCallback(SignalingCallback callback) {
    _onSignal = callback;
  }

  void setOnRemoteStream(void Function(MediaStream) callback) {
    _onRemoteStream = callback;
  }

  void setOnDataChannelOpen(void Function() callback) {
    _onDataChannelOpen = callback;
  }

  Future<void> startCapture() async {
    final mediaConstraints = <String, dynamic>{
      'audio': false,
      'video': {
        'mandatory': {
          'minWidth': '1280',
          'minHeight': '720',
          'minFrameRate': '30',
        },
        'optional': [],
      }
    };

    try {
      MediaStream stream =
          await navigator.mediaDevices.getDisplayMedia(mediaConstraints);
      _localStream = stream;
    } catch (e) {
      debugPrint('WebRTC startCapture error: $e');
    }
  }

  Future<void> startCall(bool isCaller, {String? captureMode}) async {
    // debugPrint('WebRTCService: startCall(isCaller: $isCaller, captureMode: $captureMode)');

    // Close existing connection if any, but preserve the queue if we are starting fresh
    if (_peerConnection != null) {
      await _peerConnection!.close();
      _peerConnection = null;
    }

    if (_localStream != null) {
      _localStream!.dispose();
      _localStream = null;
    }

    // Don't call stopCall() here because it clears _candidateQueue, which might already have
    // candidates if they arrived while startCall was being scheduled.
    // However, usually Offer comes first.
    // Let's just close the PC and Stream, but keep the queue logic handled carefully.

    _isCaller = isCaller;
    _isController = isCaller; // For legacy calls, Caller is Controller
    _captureMode = captureMode;

    // Create Peer Connection
    // debugPrint('WebRTCService: Creating PeerConnection...');
    _peerConnection = await createPeerConnection(_config, _constraints);

    // If WebRTC mode and Controlled (Callee), start capture and add track
    if (!isCaller && captureMode == 'webrtc') {
      // Start foreground service first to comply with Android 14+ MediaProjection requirements
      bool serviceStarted = true;
      if (Platform.isAndroid) {
        serviceStarted = await ScreenCaptureService().startForegroundService();
      }

      if (!serviceStarted) {
        debugPrint(
            'WebRTCService: Failed to start foreground service. Aborting capture.');
        return;
      }

      // Short delay to ensure service is fully registered
      if (Platform.isAndroid) {
        await Future.delayed(const Duration(milliseconds: 500));
      }

      await startCapture();
      if (_localStream != null) {
        _localStream!.getTracks().forEach((track) {
          _peerConnection!.addTrack(track, _localStream!);
        });
      }
    }

    // Setup Ice Candidate Handler
    _peerConnection!.onIceCandidate = (candidate) {
      // debugPrint('WebRTCService: onIceCandidate: ${candidate.candidate}');
      _sendSignal({
        'type': 'candidate',
        'candidate': {
          'candidate': candidate.candidate,
          'sdpMid': candidate.sdpMid,
          'sdpMLineIndex': candidate.sdpMLineIndex,
        }
      });
    };

    _peerConnection!.onIceConnectionState = (state) {
      // debugPrint('WebRTCService: ICE Connection State: $state');
      controller
          ?.getService<NativeEventService>()
          ?.emit('webrtc_state', {'state': state.toString()});
    };

    _peerConnection!.onConnectionState = (state) {
      // debugPrint('WebRTCService: PeerConnection State: $state');
    };

    // Handle Remote Stream (Controller side)
    _peerConnection!.onTrack = (event) {
      if (event.streams.isNotEmpty) {
        _remoteStream = event.streams[0];
        _onRemoteStream?.call(_remoteStream!);
      }
    };

    // Setup Data Channel (for control commands)
    if (_isCaller) {
      // Controller creates data channel
      // debugPrint('WebRTCService: Creating DataChannel "control"...');
      RTCDataChannelInit dataChannelDict = RTCDataChannelInit()..ordered = true;
      _dataChannel =
          await _peerConnection!.createDataChannel('control', dataChannelDict);
      _setupDataChannel(_dataChannel!);

      // Create Offer
      // debugPrint('WebRTCService: Creating Offer...');
      RTCSessionDescription offer =
          await _peerConnection!.createOffer(_constraints);
      // debugPrint('WebRTCService: Setting Local Description (Offer)...');
      await _peerConnection!.setLocalDescription(offer);

      // debugPrint('WebRTCService: Sending Offer...');
      final signal = {
        'type': 'offer',
        'sdp': offer.sdp,
      };
      if (_captureMode != null) {
        signal['captureMode'] = _captureMode;
      }
      _sendSignal(signal);
    } else {
      // Controlee waits for data channel
      // debugPrint('WebRTCService: Waiting for DataChannel...');
      _peerConnection!.onDataChannel = (channel) {
        // debugPrint('WebRTCService: onDataChannel received: ${channel.label}');
        _dataChannel = channel;
        _setupDataChannel(channel);
      };
    }
  }

  void _setupDataChannel(RTCDataChannel channel) {
    // debugPrint('WebRTCService: _setupDataChannel for ${channel.label}');
    channel.onDataChannelState = (state) {
      // debugPrint('WebRTCService: Data Channel State: $state');
      if (state == RTCDataChannelState.RTCDataChannelOpen) {
        // debugPrint('WebRTCService: Data Channel OPEN! Emitting connection events.');
        _onDataChannelOpen?.call();

        // Notify UI that connection is established
        if (_isController) {
          // Controller side
          controller?.getService<NativeEventService>()?.emit('connected', {
            'ip': 'P2P',
            'port': 0,
            'captureMode': _captureMode,
          });
        } else {
          // Controlee side
          controller
              ?.getService<NativeEventService>()
              ?.emit('onClientConnected', {
            'status': 'connected',
            'captureMode': _captureMode,
            'client': {
              'address': 'P2P',
              'port': 0,
              'name': 'WebRTC Controller',
            }
          });
        }
      } else if (state == RTCDataChannelState.RTCDataChannelClosed) {
        // debugPrint('WebRTCService: Data Channel CLOSED.');
        if (_isController) {
          controller
              ?.getService<NativeEventService>()
              ?.emit('disconnected', {});
        } else {
          controller
              ?.getService<NativeEventService>()
              ?.emit('onClientConnected', {'status': 'disconnected'});
        }
      }
    };

    channel.onMessage = (RTCDataChannelMessage message) {
      if (message.isBinary) {
        // debugPrint('WebRTCService: Received binary message (size: ${message.binary.length})');
        return;
      }

      // debugPrint('WebRTCService: Received text message (length: ${message.text.length})');

      // Handle control commands
      try {
        final data = jsonDecode(message.text);

        // Check if it's a chunk
        if (data is Map && data['_chunk'] == true) {
          final id = data['id'];
          final idx = data['i'];
          final total = data['t'];
          final chunkData = data['d'];

          if (!_chunkCache.containsKey(id)) {
            _chunkCache[id] = List<String?>.filled(total, null);
          }
          _chunkCache[id]![idx] = chunkData;

          // Check if complete
          if (_chunkCache[id]!.every((c) => c != null)) {
            final fullDataStr = _chunkCache[id]!.join('');
            _chunkCache.remove(id);

            // debugPrint('WebRTCService: Full data reassembled (id: $id, size: ${fullDataStr.length})');

            // Process full data
            try {
              final fullData = jsonDecode(fullDataStr);
              if (_isController) {
                ControlService().processResponse(fullData);
              } else {
                ControlService().processCommand(fullData);
              }
            } catch (e) {
              debugPrint('Error decoding reassembled chunk data: $e');
            }
          }
          return;
        }

        // debugPrint('WebRTCService: Received non-chunked message');
        if (_isController) {
          ControlService().processResponse(data);
        } else {
          ControlService().processCommand(data);
        }
      } catch (e) {
        // Handle non-JSON data
        debugPrint('WebRTCService: Error processing message: $e');
      }
    };
  }

  Future<void> handleSignal(Map<String, dynamic> data) async {
    final type = data['type'];

    // Handle queued candidates if PeerConnection is not ready yet
    if (_peerConnection == null) {
      if (type == 'candidate') {
        debugPrint(
            'WebRTCService: Buffering candidate (PeerConnection not ready)');
        final candidateMap = data['candidate'];
        RTCIceCandidate candidate = RTCIceCandidate(
          candidateMap['candidate'],
          candidateMap['sdpMid'],
          candidateMap['sdpMLineIndex'] as int?,
        );
        _candidateQueue.add(candidate);
      } else if (type == 'offer') {
        // If PeerConnection is null and we receive an Offer, we should ideally startCall here.
        // But startCall is handled in SignalingService.
        // We can proceed to setRemoteDescription if startCall finished concurrently?
        // No, if _peerConnection is null, we can't do anything.
        // This implies startCall failed or hasn't started.
        // In SignalingService logic: startCall() is awaited, THEN handleSignal() is called.
        // So if we are here with 'offer' and PC is null, something is very wrong (startCall failed).
        debugPrint('WebRTCService: Received Offer but PeerConnection is null!');
      } else {
        debugPrint(
            'WebRTCService: Dropping signal $type (PeerConnection is null)');
      }
      return;
    }

    if (type == 'offer') {
      await _peerConnection!
          .setRemoteDescription(RTCSessionDescription(data['sdp'], 'offer'));

      // Process queued candidates
      await _processCandidateQueue();

      RTCSessionDescription answer =
          await _peerConnection!.createAnswer(_constraints);
      await _peerConnection!.setLocalDescription(answer);
      _sendSignal({
        'type': 'answer',
        'sdp': answer.sdp,
      });
    } else if (type == 'answer') {
      await _peerConnection!
          .setRemoteDescription(RTCSessionDescription(data['sdp'], 'answer'));

      // Process queued candidates
      await _processCandidateQueue();
    } else if (type == 'candidate') {
      final candidateMap = data['candidate'];
      RTCIceCandidate candidate = RTCIceCandidate(
        candidateMap['candidate'],
        candidateMap['sdpMid'],
        candidateMap['sdpMLineIndex'] as int?,
      );

      if (await _peerConnection!.getRemoteDescription() != null) {
        try {
          await _peerConnection!.addCandidate(candidate);
        } catch (e) {
          debugPrint('WebRTCService: Error adding candidate: $e');
        }
      } else {
        debugPrint(
            'WebRTCService: Buffering candidate (RemoteDescription not set)');
        _candidateQueue.add(candidate);
      }
    }
  }

  Future<void> _processCandidateQueue() async {
    debugPrint(
        'WebRTCService: Processing ${_candidateQueue.length} queued candidates');
    for (var candidate in _candidateQueue) {
      try {
        await _peerConnection!.addCandidate(candidate);
      } catch (e) {
        debugPrint('WebRTCService: Error adding queued candidate: $e');
      }
    }
    _candidateQueue.clear();
  }

  void _sendSignal(Map<String, dynamic> data) {
    _onSignal?.call(data);
    // Also emit to JS so it can send via whatever signaling channel (Relay or Direct)
    controller
        ?.getService<NativeEventService>()
        ?.emit('webrtc_local_signal', data);
  }

  bool get isDataChannelOpen =>
      _dataChannel != null &&
      _dataChannel!.state == RTCDataChannelState.RTCDataChannelOpen;

  Future<bool> sendData(String data) async {
    if (!isDataChannelOpen) return false;

    // Split into chunks of 12KB (safe limit to account for JSON wrapper overhead)
    const chunkSize = 12 * 1024;

    if (data.length <= chunkSize) {
      try {
        await _dataChannel!.send(RTCDataChannelMessage(data));
        return true;
      } catch (e) {
        debugPrint('Error sending data via WebRTC: $e');
        return false;
      }
    }

    // Large data: Chunk it
    final msgId = DateTime.now().millisecondsSinceEpoch.toString() +
        '_' +
        (data.length).toString();
    final totalChunks = (data.length / chunkSize).ceil();

    try {
      for (int i = 0; i < totalChunks; i++) {
        final start = i * chunkSize;
        final end =
            (start + chunkSize < data.length) ? start + chunkSize : data.length;
        final chunk = data.substring(start, end);

        final chunkMsg = {
          '_chunk': true,
          'id': msgId,
          'i': i,
          't': totalChunks,
          'd': chunk
        };

        await _dataChannel!.send(RTCDataChannelMessage(jsonEncode(chunkMsg)));
      }
      return true;
    } catch (e) {
      debugPrint('Error sending chunked data via WebRTC: $e');
      return false;
    }
  }

  Future<bool> sendControlData(Map<String, dynamic> data) async {
    return sendData(jsonEncode(data));
  }

  Future<void> stopCall() async {
    // debugPrint('WebRTCService: stopCall');
    try {
      if (_dataChannel != null) {
        await _dataChannel!.close();
        _dataChannel = null;
      }
      if (_peerConnection != null) {
        await _peerConnection!.close();
        _peerConnection = null;
      }
      if (_localStream != null) {
        await _localStream!.dispose();
        _localStream = null;
      }

      // Stop foreground service if in WebRTC mode
      if (!_isCaller && _captureMode == 'webrtc') {
        await ScreenCaptureService().stopForegroundService();
      }

      if (_remoteStream != null) {
        await _remoteStream!.dispose();
        _remoteStream = null;
      }
      _candidateQueue.clear();
      _chunkCache.clear();
      _isCaller = false;
      _isController = false;
    } catch (e) {
      debugPrint('Error stopping call: $e');
    }
  }
}

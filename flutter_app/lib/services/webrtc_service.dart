import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:fuickjs_flutter/core/service/base_fuick_service.dart';
import 'package:fuickjs_flutter/core/service/native_event_service.dart';
import 'package:fuickjs_flutter/core/service/native_services.dart';

import 'control_service.dart';

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

  SignalingCallback? _onSignal;
  bool _isCaller = false;
  bool _isController = false;

  // Configuration
  final Map<String, dynamic> _config = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
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

  HttpServer? _signalingServer;
  String? _localOffer;

  WebRTCService._internal() {
    registerAsyncMethod('startCall', (args) async {
      final isCaller = args['isCaller'] == true;
      await startCall(isCaller);
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

    registerAsyncMethod('createOfferToken', (args) async {
      return await createOfferToken();
    });

    registerAsyncMethod('createAnswerToken', (args) async {
      final offerToken = args['offerToken'];
      return await createAnswerToken(offerToken);
    });

    registerAsyncMethod('completeConnection', (args) async {
      final answerToken = args['answerToken'];
      await completeConnection(answerToken);
      return true;
    });

    registerAsyncMethod('startSignalingServer', (args) async {
      final port = args['port'] ?? 8080;
      return await startSignalingServer(port);
    });

    registerAsyncMethod('connectViaUrl', (args) async {
      final url = args['url'];
      return await connectViaUrl(url);
    });
  }

  void register() {
    NativeServiceManager().registerService(() => this);
  }

  void setSignalingCallback(SignalingCallback callback) {
    _onSignal = callback;
  }

  Completer<String>? _gatheringCompleter;

  // Compression Helpers
  String _compressToken(String jsonStr) {
    final bytes = utf8.encode(jsonStr);
    final compressed = GZipCodec().encode(bytes);
    return base64Encode(compressed);
  }

  String _decompressToken(String token) {
    try {
      final compressed = base64Decode(token);
      final bytes = GZipCodec().decode(compressed);
      return utf8.decode(bytes);
    } catch (e) {
      // Fallback for uncompressed tokens (if any) or invalid data
      debugPrint('Decompression failed, assuming uncompressed: $e');
      return token;
    }
  }

  Future<String> createOfferToken({bool isController = true}) async {
    _isCaller = true;
    _isController = isController;
    _peerConnection = await createPeerConnection(_config, _constraints);

    _gatheringCompleter = Completer<String>();

    _peerConnection!.onIceGatheringState = (state) {
      if (state == RTCIceGatheringState.RTCIceGatheringStateComplete) {
        _completeGathering();
      }
    };

    // Data Channel setup
    RTCDataChannelInit dataChannelDict = RTCDataChannelInit()..ordered = true;
    _dataChannel =
        await _peerConnection!.createDataChannel('control', dataChannelDict);
    _setupDataChannel(_dataChannel!);

    RTCSessionDescription offer =
        await _peerConnection!.createOffer(_constraints);
    await _peerConnection!.setLocalDescription(offer);

    final token = await _waitForGathering();
    _localOffer = token; // Store for HTTP server
    return _compressToken(token);
  }

  Future<String> createAnswerToken(String offerToken,
      {bool isController = false}) async {
    _isCaller = false;
    _isController = isController;
    _peerConnection = await createPeerConnection(_config, _constraints);

    _gatheringCompleter = Completer<String>();

    _peerConnection!.onIceGatheringState = (state) {
      if (state == RTCIceGatheringState.RTCIceGatheringStateComplete) {
        _completeGathering();
      }
    };

    _peerConnection!.onDataChannel = (channel) {
      _dataChannel = channel;
      _setupDataChannel(channel);
    };

    // Decode offer
    final jsonStr = _decompressToken(offerToken);
    final offerMap = jsonDecode(jsonStr);
    await _peerConnection!
        .setRemoteDescription(RTCSessionDescription(offerMap['sdp'], 'offer'));

    RTCSessionDescription answer =
        await _peerConnection!.createAnswer(_constraints);
    await _peerConnection!.setLocalDescription(answer);

    final token = await _waitForGathering();
    return _compressToken(token);
  }

  Future<void> completeConnection(String answerToken) async {
    final jsonStr = _decompressToken(answerToken);
    final answerMap = jsonDecode(jsonStr);
    await _peerConnection!.setRemoteDescription(
        RTCSessionDescription(answerMap['sdp'], 'answer'));
  }

  Future<String> _waitForGathering() async {
    try {
      // Wait up to 2 seconds for candidates (public STUN is fast)
      await _gatheringCompleter!.future.timeout(Duration(seconds: 2));
    } catch (e) {
      // Timeout, just proceed
    }
    final desc = await _peerConnection!.getLocalDescription();
    return jsonEncode({'sdp': desc!.sdp, 'type': desc.type});
  }

  void _completeGathering() {
    if (_gatheringCompleter != null && !_gatheringCompleter!.isCompleted) {
      _gatheringCompleter!.complete('done');
    }
  }

  // HTTP Signaling Server (For Tune/Direct Connection)
  Future<Map<String, dynamic>> startSignalingServer(int port) async {
    try {
      await _signalingServer?.close(force: true);
      _signalingServer = await HttpServer.bind(InternetAddress.anyIPv4, port);

      // Generate offer immediately if not exists
      // Controlee is running the server, so isController = false
      if (_localOffer == null) {
        await createOfferToken(isController: false);
      }

      _signalingServer!.listen((HttpRequest request) async {
        // Enable CORS
        request.response.headers.add('Access-Control-Allow-Origin', '*');
        request.response.headers
            .add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        request.response.headers
            .add('Access-Control-Allow-Headers', 'Content-Type');

        if (request.method == 'OPTIONS') {
          request.response.close();
          return;
        }

        if (request.uri.path == '/offer' && request.method == 'GET') {
          // Return the uncompressed JSON offer
          request.response.headers.contentType = ContentType.json;
          request.response.write(_localOffer);
          request.response.close();
        } else if (request.uri.path == '/answer' && request.method == 'POST') {
          try {
            final content = await utf8.decodeStream(request);
            final answerMap = jsonDecode(content);
            // We got the answer, complete connection
            await _peerConnection!.setRemoteDescription(
                RTCSessionDescription(answerMap['sdp'], 'answer'));

            request.response.write(jsonEncode({'success': true}));
          } catch (e) {
            request.response.statusCode = HttpStatus.badRequest;
            request.response.write(jsonEncode({'error': e.toString()}));
          } finally {
            request.response.close();
          }
        } else {
          request.response.statusCode = HttpStatus.notFound;
          request.response.close();
        }
      });

      return {'success': true, 'port': port};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  // Client Side: Connect via URL
  Future<Map<String, dynamic>> connectViaUrl(String url) async {
    try {
      // 1. Get Offer
      final client = HttpClient();
      // Allow self-signed certs if using HTTPS (common with some tunnel tools)
      client.badCertificateCallback = (cert, host, port) => true;

      // Ensure URL has protocol
      if (!url.startsWith('http')) {
        url = 'http://$url';
      }
      // Remove trailing slash
      if (url.endsWith('/')) {
        url = url.substring(0, url.length - 1);
      }

      final offerReq = await client.getUrl(Uri.parse('$url/offer'));
      final offerRes = await offerReq.close();
      if (offerRes.statusCode != 200) {
        return {
          'success': false,
          'error': 'Failed to get offer: ${offerRes.statusCode}'
        };
      }
      final offerJson = await utf8.decodeStream(offerRes);

      // 2. Create Answer
      _isCaller = false;
      _isController = true; // Controller connecting via URL
      _peerConnection = await createPeerConnection(_config, _constraints);
      _gatheringCompleter = Completer<String>();

      _peerConnection!.onIceGatheringState = (state) {
        if (state == RTCIceGatheringState.RTCIceGatheringStateComplete) {
          _completeGathering();
        }
      };

      _peerConnection!.onDataChannel = (channel) {
        _dataChannel = channel;
        _setupDataChannel(channel);
      };

      final offerMap = jsonDecode(offerJson);
      await _peerConnection!.setRemoteDescription(
          RTCSessionDescription(offerMap['sdp'], 'offer'));

      RTCSessionDescription answer =
          await _peerConnection!.createAnswer(_constraints);
      await _peerConnection!.setLocalDescription(answer);

      // Wait for gathering
      final answerTokenJson = await _waitForGathering();

      // 3. Post Answer
      final answerReq = await client.postUrl(Uri.parse('$url/answer'));
      answerReq.headers.contentType = ContentType.json;
      answerReq.write(answerTokenJson);
      final answerRes = await answerReq.close();

      if (answerRes.statusCode == 200) {
        return {'success': true};
      } else {
        return {
          'success': false,
          'error': 'Failed to send answer: ${answerRes.statusCode}'
        };
      }
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<void> startCall(bool isCaller) async {
    _isCaller = isCaller;
    _isController = isCaller; // For legacy calls, Caller is Controller

    // Create Peer Connection
    _peerConnection = await createPeerConnection(_config, _constraints);

    // Setup Ice Candidate Handler
    _peerConnection!.onIceCandidate = (candidate) {
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
      debugPrint('ICE Connection State: $state');
      controller
          ?.getService<NativeEventService>()
          ?.emit('webrtc_state', {'state': state.toString()});
    };

    // Handle Remote Stream (Controller side)
    _peerConnection!.onTrack = (event) {
      // Not using MediaStream for now, using DataChannel for frames
    };

    // Setup Data Channel (for control commands)
    if (_isCaller) {
      // Controller creates data channel
      RTCDataChannelInit dataChannelDict = RTCDataChannelInit()..ordered = true;
      _dataChannel =
          await _peerConnection!.createDataChannel('control', dataChannelDict);
      _setupDataChannel(_dataChannel!);

      // Create Offer
      RTCSessionDescription offer =
          await _peerConnection!.createOffer(_constraints);
      await _peerConnection!.setLocalDescription(offer);
      _sendSignal({
        'type': 'offer',
        'sdp': offer.sdp,
      });
    } else {
      // Controlee waits for data channel
      _peerConnection!.onDataChannel = (channel) {
        _dataChannel = channel;
        _setupDataChannel(channel);
      };
    }
  }

  void _setupDataChannel(RTCDataChannel channel) {
    channel.onDataChannelState = (state) {
      debugPrint('Data Channel State: $state');
      if (state == RTCDataChannelState.RTCDataChannelOpen) {
        // Notify UI that connection is established
        if (_isController) {
          // Controller side
          controller?.getService<NativeEventService>()?.emit('connected', {
            'ip': 'P2P',
            'port': 0,
          });
        } else {
          // Controlee side
          controller
              ?.getService<NativeEventService>()
              ?.emit('onClientConnected', {
            'status': 'connected',
            'client': {
              'address': 'P2P',
              'port': 0,
              'name': 'WebRTC Controller',
            }
          });
        }
      } else if (state == RTCDataChannelState.RTCDataChannelClosed) {
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
      if (message.isBinary) return;
      // Handle control commands
      try {
        final data = jsonDecode(message.text);
        if (_isController) {
          ControlService().processResponse(data);
        } else {
          ControlService().processCommand(data);
        }
      } catch (e) {
        // Handle non-JSON data
      }
    };
  }

  Future<void> handleSignal(Map<String, dynamic> data) async {
    if (_peerConnection == null) return;

    final type = data['type'];
    if (type == 'offer') {
      await _peerConnection!
          .setRemoteDescription(RTCSessionDescription(data['sdp'], 'offer'));
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
    } else if (type == 'candidate') {
      final candidateMap = data['candidate'];
      RTCIceCandidate candidate = RTCIceCandidate(
        candidateMap['candidate'],
        candidateMap['sdpMid'],
        candidateMap['sdpMLineIndex'] as int?,
      );
      await _peerConnection!.addCandidate(candidate);
    }
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
    try {
      await _dataChannel!.send(RTCDataChannelMessage(data));
      return true;
    } catch (e) {
      debugPrint('Error sending data via WebRTC: $e');
      return false;
    }
  }

  Future<bool> sendControlData(Map<String, dynamic> data) async {
    return sendData(jsonEncode(data));
  }

  Future<void> stopCall() async {
    try {
      await _dataChannel?.close();
      await _peerConnection?.close();
      _peerConnection = null;
      _dataChannel = null;
      _localStream?.dispose();
      _localStream = null;
      _remoteStream?.dispose();
      _remoteStream = null;
    } catch (e) {
      debugPrint(e.toString());
    }
  }
}

@extends('layouts.app')

@section('content')
    <div class="panel">
        <div class="panel-body">
            <div class="room-header">
                <div>
                    <h1>{{ $appName }}</h1>
                    <p class="muted">Room: <span id="room-code">{{ $room }}</span></p>
                </div>
                @if ($isHost ?? false)
                    <div class="share">
                        <input type="text" readonly value="{{ url()->current() }}" id="room-link">
                        <button type="button" data-action="copy-link">Copy link</button>
                    </div>
                @endif
            </div>
            <div class="status" id="call-status">Choose video or audio-only when you are ready.</div>
            <div class="video-grid">
                <video id="localVideo" autoplay playsinline muted></video>
                <video id="remoteVideo" autoplay playsinline></video>
            </div>
            <div class="controls">
                <button type="button" data-action="start-call">Start video call</button>
                <button type="button" data-action="start-audio-call">Start audio-only</button>
                <button type="button" data-action="toggle-audio">Mute</button>
                <button type="button" data-action="toggle-video">Stop video</button>
                <button type="button" data-action="hangup">Leave</button>
            </div>
            @if ($isHost ?? false)
                <div class="dialer-panel" data-dialer-panel>
                    <div class="dialer-panel-header">
                        <div>
                            <h3>Phone dialer</h3>
                            <p class="muted" data-dialer-helper>Configure a PSTN provider to enable dialing.</p>
                        </div>
                        <p class="dialer-status" data-dialer-status hidden></p>
                    </div>
                    <form data-dialer-form class="dialer-form">
                        <label for="dialer-number">Phone number</label>
                        <div class="dialer-inputs">
                            <input id="dialer-number" type="text" placeholder="+1 555 123 4567" data-dialer-input autocomplete="off">
                            <input type="text" placeholder="Label (optional)" data-dialer-label autocomplete="off">
                        </div>
                        <button type="submit" data-dialer-button>Call</button>
                    </form>
                </div>
            @endif
        </div>
    </div>

@endsection

@push('scripts')
    <script>
        window.meetingConfig = {
            room: @json($room),
            copySuccessText: 'Link copied to clipboard',
            isHost: @json($isHost ?? false),
            csrfToken: @json(csrf_token()),
            dialer: @json($dialer ?? ['enabled' => false]),
        };
    </script>
    <script src="/socket.io/socket.io.js"></script>
    <script src="{{ asset('js/webrtc.js') }}" defer></script>
@endpush

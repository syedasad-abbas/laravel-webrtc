@extends('layouts.app')

@section('content')
    <section class="panel">
        <div class="panel-body">
            <h1>Create a room</h1>
            <p>Spin up a private room and share the link with anyone you'd like to talk to. No branding, just audio and video.</p>
            <form method="POST" action="{{ route('rooms.store') }}" class="form-inline">
                @csrf
                <label for="room_name">Optional room name</label>
                <input
                    id="room_name"
                    type="text"
                    name="room_name"
                    placeholder="e.g. product-sync"
                    maxlength="40"
                >
                <label for="participant_name_create">Your display name</label>
                <input
                    id="participant_name_create"
                    type="text"
                    name="participant_name"
                    placeholder="Jane Doe"
                    maxlength="40"
                    required
                >
                <button type="submit" formtarget="_blank">Create meeting</button>
            </form>
        </div>
    </section>

    <section class="panel">
        <div class="panel-body">
            <h2>Join existing room</h2>
            <form method="POST" action="{{ route('rooms.join') }}" class="form-inline">
                @csrf
                <label for="room">Room link or code</label>
                <input
                    id="room"
                    type="text"
                    name="room"
                    placeholder="room code"
                    required
                >
                <label for="participant_name_join">Your display name</label>
                <input
                    id="participant_name_join"
                    type="text"
                    name="participant_name"
                    placeholder="Jane Doe"
                    maxlength="40"
                    required
                >
                <button type="submit" formtarget="_blank">Join</button>
            </form>
        </div>
    </section>
@endsection

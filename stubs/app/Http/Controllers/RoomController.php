<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\View\View;

class RoomController extends Controller
{
    public function index(): View
    {
        return view('home');
    }

    public function store(Request $request): RedirectResponse
    {
        $request->validate([
            'room_name' => ['nullable', 'string', 'max:40'],
            'participant_name' => ['required', 'string', 'max:40'],
        ]);

        $room = $this->sanitizeRoom($request->input('room_name'));

        if (! $room) {
            $room = 'room-' . Str::lower(Str::random(6));
        }

        $name = $this->sanitizeName($request->input('participant_name'));
        $this->rememberParticipant($request, $room, $name);
        $this->markCreator($request, $room);

        return redirect()->route('rooms.show', ['code' => $room]);
    }

    public function join(Request $request): RedirectResponse
    {
        $request->validate([
            'room' => ['required', 'string', 'max:60'],
            'participant_name' => ['required', 'string', 'max:40'],
        ]);

        $room = $this->sanitizeRoom($request->input('room'));

        if (! $room) {
            return redirect()->route('home')->with('error', 'Please provide a valid room name.');
        }

        $name = $this->sanitizeName($request->input('participant_name'));
        $this->rememberParticipant($request, $room, $name);

        return redirect()->route('rooms.show', ['code' => $room]);
    }

    public function enter(Request $request, string $code): RedirectResponse
    {
        $room = $this->sanitizeRoom($code) ?: $code;

        $request->validate([
            'participant_name' => ['required', 'string', 'max:40'],
        ]);

        $name = $this->sanitizeName($request->input('participant_name'));
        $this->rememberParticipant($request, $room, $name);

        return redirect()->route('rooms.show', ['code' => $room]);
    }

    public function show(Request $request, string $code): View
    {
        $room = $this->sanitizeRoom($code) ?: $code;
        $name = $request->session()->get($this->sessionKey($room));

        $isCreator = $this->isCreator($request, $room);

        return view('room', [
            'room' => $room,
            'appName' => config('app.name', 'Laravel WebRTC'),
            'participantName' => $name,
            'isCreator' => $isCreator,
            'participantApproved' => $isCreator,
        ]);
    }

    private function sanitizeRoom(?string $value): string
    {
        if (! $value) {
            return '';
        }

        $clean = Str::of($value)
            ->lower()
            ->replaceMatches('/[^a-z0-9-]/', '');

        return (string) $clean;
    }

    private function sanitizeName(string $value): string
    {
        return (string) Str::of($value)->stripTags()->squish()->limit(40, '');
    }

    private function rememberParticipant(Request $request, string $room, string $name): void
    {
        $request->session()->put($this->sessionKey($room), $name);
    }

    private function sessionKey(string $room): string
    {
        return 'participant_name_' . $room;
    }

    private function creatorKey(string $room): string
    {
        return 'room_creator_' . $room;
    }

    private function markCreator(Request $request, string $room): void
    {
        $request->session()->put($this->creatorKey($room), true);
    }

    private function isCreator(Request $request, string $room): bool
    {
        return (bool) $request->session()->get($this->creatorKey($room), false);
    }
}

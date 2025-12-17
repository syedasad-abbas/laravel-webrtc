<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\View\View;

class RoomController extends Controller
{
    public function index(): View
    {
        $activeUsers = User::currentlyActive()->orderBy('name')->get();

        return view('home', [
            'activeUsers' => $activeUsers,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $request->validate([
            'room_name' => ['nullable', 'string', 'max:40'],
        ]);

        $room = $this->sanitizeRoom($request->input('room_name'));

        if (! $room) {
            $room = 'room-' . Str::lower(Str::random(6));
        }

        return redirect()->route('rooms.show', ['code' => $room]);
    }

    public function join(Request $request): RedirectResponse
    {
        $request->validate([
            'room' => ['required', 'string', 'max:60'],
        ]);

        $room = $this->sanitizeRoom($request->input('room'));

        if (! $room) {
            return redirect()->route('home')->with('error', 'Please provide a valid room name.');
        }

        return redirect()->route('rooms.show', ['code' => $room]);
    }

    public function show(string $code): View
    {
        $room = $this->sanitizeRoom($code) ?: $code;

        return view('room', [
            'room' => $room,
            'appName' => config('app.name', 'Laravel WebRTC'),
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
}

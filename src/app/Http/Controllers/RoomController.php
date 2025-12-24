<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
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

        $this->rememberHostRoom($room);

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

        $isHost = $this->isHostRoom($room);

        if ($isHost) {
            $this->rememberHostRoom($room);
        }

        return view('room', [
            'room' => $room,
            'appName' => config('app.name', 'Laravel WebRTC'),
            'isHost' => $isHost,
            'hideAuthActions' => ! $isHost,
        ]);
    }

    public function dial(Request $request, string $code): JsonResponse
    {
        $room = $this->sanitizeRoom($code) ?: $code;

        if (! $this->isHostRoom($room)) {
            abort(Response::HTTP_FORBIDDEN, 'Only the meeting host can dial out.');
        }

        $data = $request->validate([
            'phone' => ['required', 'string', 'max:32', 'regex:/^[0-9+()\\-\\s\\.]+$/'],
            'label' => ['nullable', 'string', 'max:60'],
        ]);

        $settings = config('services.pstn') ?? [];

        if (empty($settings['enabled']) || empty($settings['url'])) {
            return response()->json([
                'message' => 'Dial-out provider is not configured.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $payload = [
            'to' => $data['phone'],
            'from' => $settings['from'] ?? null,
            'room' => $room,
            'label' => $data['label'] ?? null,
            'callback_url' => $settings['callback'] ?? null,
            'host' => [
                'id' => auth()->id(),
                'name' => auth()->user()?->name,
            ],
        ];

        $payload['host'] = array_filter($payload['host'], fn ($value) => ! empty($value));
        $payload = array_filter($payload, fn ($value) => $value !== null && $value !== '' && $value !== []);

        $headers = [
            'Accept' => 'application/json',
        ];

        if (! empty($settings['token'])) {
            $headers['Authorization'] = 'Bearer ' . $settings['token'];
        }

        try {
            $response = Http::timeout($settings['timeout'] ?? 10)
                ->withHeaders($headers)
                ->post($settings['url'], $payload);
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Unable to reach the dial-out provider. Please try again.',
            ], Response::HTTP_BAD_GATEWAY);
        }

        if ($response->failed()) {
            $body = $response->json() ?: $response->body();

            return response()->json([
                'message' => 'The dial-out provider rejected the request.',
                'provider' => $body,
            ], max($response->status(), Response::HTTP_BAD_REQUEST));
        }

        $body = $response->json();

        return response()->json([
            'status' => 'queued',
            'message' => 'Dial-out request sent to provider.',
            'provider' => $body,
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

    private function rememberHostRoom(string $room): void
    {
        if (auth()->check()) {
            Cache::put($this->hostCacheKey($room), auth()->id(), now()->addHours(12));
        }

        session()->put($this->sessionHostKey($room), true);
    }

    private function isHostRoom(string $room): bool
    {
        if (auth()->check() && Cache::get($this->hostCacheKey($room)) === auth()->id()) {
            return true;
        }

        return (bool) session()->get($this->sessionHostKey($room), false);
    }

    private function hostCacheKey(string $room): string
    {
        return 'room-host:' . $room;
    }

    private function sessionHostKey(string $room): string
    {
        return 'room-session-host:' . $room;
    }
}

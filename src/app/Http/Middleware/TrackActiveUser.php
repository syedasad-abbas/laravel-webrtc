<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class TrackActiveUser
{
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);

        $user = $request->user();

        if ($user) {
            $shouldUpdate = $user->last_seen_at === null
                || $user->last_seen_at->lt(now()->subMinute());

            if ($shouldUpdate) {
                $user->forceFill([
                    'last_seen_at' => now(),
                ])->saveQuietly();
            }
        }

        return $response;
    }
}

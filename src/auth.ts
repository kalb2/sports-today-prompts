function encode(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}

/**
 * Timing-safe comparison of the Authorization header against `Bearer ${PUBLISH_TOKEN}`.
 */
export function isAuthorized(request: Request, env: Env): boolean {
	const header = request.headers.get("Authorization");
	const token = env.PUBLISH_TOKEN;
	if (!header || !token) {
		return false;
	}

	const expected = `Bearer ${token}`;
	const provided = encode(header);
	const wanted = encode(expected);

	if (provided.byteLength !== wanted.byteLength) {
		return false;
	}

	return crypto.subtle.timingSafeEqual(provided, wanted);
}

export function GET() {
    return new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="12" fill="#0b0b0b"/>
      <path fill="#1ae784" d="M14 18h36v8H14zM14 30h22v8H14zM14 42h36v8H14z"/>
    </svg>`,
        {
            headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'public, max-age=86400',
            },
        },
    );
}

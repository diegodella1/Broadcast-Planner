import { CSRF_FIELD, getCsrfToken } from '@/lib/csrf';

export async function CsrfInput() {
    const token = await getCsrfToken();

    return <input type="hidden" name={CSRF_FIELD} value={token} />;
}

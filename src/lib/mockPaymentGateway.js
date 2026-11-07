export async function charge({ decline = false } = {}) {
  return decline ? { status: 'declined' } : { status: 'succeeded' };
}

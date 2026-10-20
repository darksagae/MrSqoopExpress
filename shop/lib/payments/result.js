/** Retain detailed outcomes while supporting the direct providers' string API. */
export async function readPaymentResult(provider, reference) {
  const result = provider.getPaymentResult
    ? await provider.getPaymentResult(reference)
    : { status: await provider.getPaymentStatus(reference) };
  const status = String(result.status || 'UNKNOWN').toUpperCase();
  return {
    status,
    failureReason: status === 'SUCCESSFUL' ? null : (result.reason || status),
  };
}

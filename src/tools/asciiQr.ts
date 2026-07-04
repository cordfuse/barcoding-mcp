import QRCode from "qrcode";

export interface QrTerminalArgs {
  /** Data to encode into the QR. */
  data: string;
  /** Half-height block rendering — fits a real terminal. Default true. */
  small?: boolean;
  /** QR error-correction level. Default "M". */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
}

/**
 * Encode data to an ASCII / Unicode-block QR for direct terminal display.
 * Pure text output — no image channel required.
 */
export async function encodeQrTerminal(args: QrTerminalArgs): Promise<string> {
  const { data, small = true, errorCorrectionLevel = "M" } = args;
  return QRCode.toString(data, {
    type: "terminal",
    small,
    errorCorrectionLevel,
  });
}

import QRCode from "qrcode";

export interface QrTerminalArgs {
  /** Data to encode into the QR. */
  data: string;
  /**
   * Output style:
   * - "unicode" (default): plain Unicode block characters, no escape codes.
   *   Renders correctly in codeblocks, chat, logs, and agent transcripts.
   * - "ansi": ANSI-coloured blocks. Sharp in a real terminal (TTY), but
   *   garbles anywhere ANSI escapes aren't interpreted.
   */
  style?: "unicode" | "ansi";
  /** Half-height block rendering — fits a real terminal. Default true. */
  small?: boolean;
  /** QR error-correction level. Default "M". */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
}

/**
 * Encode data to a block-character QR for direct display.
 * Pure text output — no image channel required.
 */
export async function encodeQrTerminal(args: QrTerminalArgs): Promise<string> {
  const { data, style = "unicode", small = true, errorCorrectionLevel = "M" } = args;
  return QRCode.toString(data, {
    type: style === "ansi" ? "terminal" : "utf8",
    small,
    errorCorrectionLevel,
  });
}

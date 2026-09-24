export class GatewayError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(options: {
    code: string;
    message: string;
    status: number;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = "GatewayError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
  }
}

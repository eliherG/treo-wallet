/** Error HTTP con información aprobada para exposición pública. */
export class HttpProblem extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly title: string,
    public readonly publicDetail: string,
  ) {
    super(publicDetail);
    this.name = 'HttpProblem';
  }
}

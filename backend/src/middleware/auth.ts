import { Request, Response, NextFunction } from 'express'

// TODO: implement JWT verification
export function authenticate(
  _req: Request,
  _res: Response,
  next: NextFunction
): void {
  next()
}

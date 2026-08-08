import { Request } from 'express';

export interface AdminRequest extends Request {
  admin?: {
    email: string;
  };
}

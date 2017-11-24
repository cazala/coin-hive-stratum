// Misc

export type Dictionary<T> = {
  [key: string]: T;
};

export type Job = {
  blob: string;
  job_id: string;
  target: string;
  id: string;
};

export type Stats = {
  miners: number;
  connections: number;
};

export type WebSocketQuery = {
  pool?: string;
};

export type QueueMessage = {
  type: string;
  payload: any;
};

export type RPCMessage = {
  minerId: string;
  message: StratumRequest;
};

export type Socket = NodeJS.Socket & {
  destroy: () => void;
  setKeepAlive: (value: boolean) => void;
};

// CoinHive

export type CoinHiveRequest = {
  type: string;
  params: CoinHiveLoginParams | CoinHiveJob;
};

export type CoinHiveLoginParams = {
  site_key: string;
  user: string | null;
};

export type CoinHiveJob = Job;

export type CoinHiveResponse = {
  type: string;
  params: CoinHiveLoginResult | CoinHiveSubmitResult | CoinHiveJob | CoinHiveError;
};

export type CoinHiveLoginResult = {
  hashes: number;
  token: string | null;
};

export type CoinHiveSubmitResult = {
  hashes: number;
};

export type CoinHiveError = {
  error: string;
};

// Stratum

export type StratumRequest = {
  id: number;
  method: string;
  params: StratumRequestParams;
};

export type StratumRequestParams = StratumLoginParams | StratumJob | StratumKeepAlive | StratumEmptyParams;

export type StratumLoginParams = {
  login: string;
  pass?: string;
};

export type StratumJob = Job & {
  id: string;
};

export type StratumEmptyParams = {};

export type StratumResponse = {
  id: string;
  result: StratumResult;
  error: StratumError;
};

export type StratumResult = StratumSubmitResult | StratumLoginResult;

export type StratumSubmitResult = {
  status: string;
};

export type StratumLoginResult = {
  id: string;
  job: Job;
  status: string;
};

export type StratumError = {
  code: number;
  error: string;
};

export type StratumKeepAlive = {
  id: string;
};

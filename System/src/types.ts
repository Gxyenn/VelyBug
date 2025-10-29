export enum Role {
  ADMIN = 'admin',
  USER = 'user',
  CREATOR = 'creator',
  DEVELOPER = 'developer',
}

export interface Key {
  id: string;
  value: string;
  role: Role;
  username: string;
}

export interface Server {
  id:string;
  serverName: string;
  commandFormat: string;
}

export interface Settings {
  botToken: string;
  chatId: string;
}

export enum HistoryAction {
  CREATED = 'created',
  DELETED = 'deleted',
}

export interface HistoryLog {
  id: string;
  actorUsername: string;
  action: HistoryAction;
  targetUsername: string;
  targetRole: Role;
  timestamp: Date;
}

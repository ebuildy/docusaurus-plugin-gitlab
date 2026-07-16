import React from "react";
import { parseShow } from "../gitlab/users.js";
import { Fallback } from "./Fallback.js";
import { UserCard } from "./UserCard.js";
import type { ComponentPayload, UserData } from "./types.js";

interface GitlabUserProps extends ComponentPayload<UserData> {
  /** Comma-separated card sections; validated at build time by the fetcher. */
  show?: string;
}

export function GitlabUser({ data, error, show }: GitlabUserProps) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return <UserCard user={data} show={parseShow(show, "GitlabUser")} />;
}

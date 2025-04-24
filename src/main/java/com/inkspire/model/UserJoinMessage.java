package com.inkspire.model;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor      // ← MUST be present so Jackson can call the no-arg constructor
public class UserJoinMessage {
    private String sessionCode;
    private Long   userId;
    private String username; // only set when server rebroadcasts
    private String action;   // "joined" or "left"

    // convenience constructor for broadcast
    public UserJoinMessage(Long userId, String username, String action) {
        this.userId   = userId;
        this.username = username;
        this.action   = action;
    }
}

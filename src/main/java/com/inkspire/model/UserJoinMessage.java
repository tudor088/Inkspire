package com.inkspire.model;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter @Setter @NoArgsConstructor
public class UserJoinMessage {
    private String sessionCode;
    private Long   userId;
    private String username;
    private String action;   // "joined" or "left"

    public UserJoinMessage(Long userId, String username, String action) {
        this.userId   = userId;
        this.username = username;
        this.action   = action;
    }
}

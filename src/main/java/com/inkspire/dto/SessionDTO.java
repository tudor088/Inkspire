package com.inkspire.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@AllArgsConstructor
public class SessionDTO {
    private String sessionCode;
    private String name;
    private String creatorUsername;
    private boolean passwordProtected;
    private LocalDateTime createdAt;
    private int connectedUsersCount;  // Add this field to reflect number of users connected
}

package com.inkspire.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class ChatMessageDTO {
    private String sessionCode;
    private Long   userId;
    private String username;
    private String content;
    private String isoTimestamp;   // for the frontend clock
}

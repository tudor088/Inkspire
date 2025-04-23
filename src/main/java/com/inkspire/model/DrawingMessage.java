package com.inkspire.model;

import lombok.Getter;
import lombok.Setter;

@Getter @Setter
public class DrawingMessage {
    private String sessionCode;
    private Long userId;
    private String type;
    private String dataJson;
    private String clientId; // 👈 Needed for filtering echoes
    private String action; // e.g., "draw", "undo", "redo", "clear"
    private String strokeId; // add this line at the bottom
}

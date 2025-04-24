// CreateSessionRequest.java
package com.inkspire.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateSessionRequest {
    private String name;
    private String password; // optional
}

package com.inkspire.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Getter @Setter
@NoArgsConstructor
public class DrawingElement {

    @Id
    private String id; // UUID sent from the client

    @ManyToOne
    private WhiteboardSession session;

    @ManyToOne
    private User author;

    private String type;        // e.g., "freehand", "text", "shape"
    @Column(columnDefinition = "LONGTEXT")
    private String dataJson;
    private int orderIndex;     // for sorting / undo-redo


}

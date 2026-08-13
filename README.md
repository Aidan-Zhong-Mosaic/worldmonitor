# Requirement

Integrate World Monitor into the MosAIc chatbot.

For people from different LOBs, display specific layers of data on the map

# Design

## workflow:
```
User Authenticates
        │
        ▼
Determine User LOB
        │
        ▼
Load LOB Entitlements
        │
 ┌──────┴───────┐
 ▼              ▼
Map Layers    Panels
 ▼              ▼
Render World Monitor Experience
```


## The 3 lists:

Our line of business:

Political violence

Cyber

Political risk

Transactional liability

Financial institutions

Professional liability

Environmental liability

Specialty casualty

Map layers:

Panels we have:

## mapping strategy

Classify layers into:

Primary (enabled by default)

Secondary (available but off by default)

Not relevant (hidden by default)

[LOB → Layers](src/config/mosaic/lob2maplayers.csv)

[LOB -> Panels](src/config/mosaic/lob2panels.csv)

will be in the csv

# implementation

Replace the different variants of the original code into the 8 LOBs we have; apply the mapping strategy. 

# demo

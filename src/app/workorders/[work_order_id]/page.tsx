/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Button,
  StatusIndicator,
  Box,
  ExpandableSection,
  Alert,
} from "@cloudscape-design/components";
import UnifiedMap from '@/components/UnifiedMap';
import {WorkOrder} from '@/types/workorder';
import { Emergency } from '@/types/emergency';
import { amplifyClient, getMessageCatigory } from "@/utils/amplify-utils"; // Ensure this is correctly configured
import { createChatSession } from "@/../amplify/functions/graphql/mutations";
import ReactMarkdown from "react-markdown";
import { Message } from '@/utils/types'; // Import the correct Message type

// Define Chunk type for formatted responses
interface Chunk {
  index: number;
  content: string;
}

const WorkOrderDetails = () => {
  const searchParams = useSearchParams(); 
  const router = useRouter();
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocationVisible, setIsLocationVisible] = useState(true);
  
  const [emergencies] = useState<Emergency[]>([]);
  const [loadingEmergencies, setLoadingEmergencies] = useState(false);
  
  const [formattedResponse, setFormattedResponse] = useState<Chunk[]>([]); // Correctly typed state

  // Define the ErrorAlert component inline
  const ErrorAlert = ({ 
    errorMessage, 
    dismissible = false, 
    onDismiss 
  }: { 
    errorMessage: string | null;
    dismissible?: boolean;
    onDismiss?: () => void;
  }) => {
    if (!errorMessage) return null;
    
    return (
      <Alert
        type="error"
        dismissible={dismissible}
        onDismiss={onDismiss}
        header="Error"
      >
        {errorMessage}
      </Alert>
    );
  };

  // Define the Message type to match what's coming from the API
  interface Message {
    id: string;
    content: string;
    role: string;
    createdAt: string;
    chatSessionId?: string;
    tool_calls?: string;
    responseComplete?: boolean;
    // Optional fields that might be added during processing
    previousTrendTableMessage?: Record<string, unknown>;
    previousEventTableMessage?: Record<string, unknown>;
  }
  
  // Use a ref to store the subscription object
  const subscriptionRef = useRef<{unsubscribe: () => void} | null>(null);
  const [isSubscriptionActive, setIsSubscriptionActive] = useState(false); // Track subscription status

  // Add state to control when to render the map
  const [shouldRenderMap, setShouldRenderMap] = useState(false);
  const [mapKey, setMapKey] = useState(Date.now()); // Add a key to force map re-renders

  useEffect(() => {
    const workOrderParam = searchParams.get('workOrder');
    if (workOrderParam) {
      const parsedData = JSON.parse(workOrderParam);
      setWorkOrder(parsedData);
    }
    
    // Reset Leaflet's internal ID counter to prevent "already initialized" errors
    if (typeof window !== 'undefined' && window.L) {
      // @ts-expect-error - Leaflet stores this internally
      if (window.L._leaflet_id) {
        // @ts-expect-error - Accessing Leaflet's internal property
        window.L._leaflet_id = 0;
      }
    }
    
    // Add a small delay before rendering the map
    // This gives time for any previous map instances to be properly cleaned up
    const timer = setTimeout(() => {
      setShouldRenderMap(true);
      // Generate a new key whenever the component mounts to force a fresh map instance
      setMapKey(Date.now());
    }, 100);
    
    // Cleanup function
    return () => {
      clearTimeout(timer);
      setShouldRenderMap(false);
      
      // Unsubscribe from any active subscriptions
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        setIsSubscriptionActive(false);
      }
      
      // Clean up Leaflet map instances
      if (typeof window !== 'undefined') {
        // Reset Leaflet's internal counter
        // @ts-expect-error - Accessing Leaflet's internal property
        if (window.L && window.L._leaflet_id) {
          // @ts-expect-error - Accessing Leaflet's internal property
          window.L._leaflet_id = 0;
        }
        
        // Remove any map instances that might be stored
        const leafletContainers = document.querySelectorAll('.leaflet-container');
        leafletContainers.forEach(container => {
          // Try to access the map instance and remove it
          // @ts-expect-error - Accessing Leaflet's internal property
          if (container._leaflet_id) {
            // @ts-expect-error - Accessing Leaflet's internal property
            container._leaflet = null;
            // @ts-expect-error - Accessing Leaflet's internal property
            container._leaflet_id = null;
          }
        });
      }
    };
  }, [searchParams]);

  if (!workOrder) {
    return <div>No details found for this Work Order.</div>;
  }

  interface Chunk {
    index: number; // Index of the chunk
    content: string; // Content of the chunk
  }
  
  const subscribeToUpdates = (chatSessionId: string) => {
    if (!chatSessionId) return;
  
    // Set subscription as active
    setIsSubscriptionActive(true);
  
    // Initialize with a placeholder chunk (like the chat implementation does)
    setFormattedResponse([{
      index: -1,
      content: ""
    }]);
  
    // Subscribe to updates
    subscriptionRef.current = amplifyClient.subscriptions
      .recieveResponseStreamChunk({ chatSessionId })
      .subscribe({
        next: (newChunk) => {
          console.log("Received chunk:", newChunk);
          
          setFormattedResponse((prevStream) => {
            // Determine the chunk index - if not provided, use position after last chunk
            const chunkIndex = (typeof newChunk.index === 'undefined' || newChunk.index === null)
              ? (prevStream.length > 0 ? Math.max(...prevStream.map(c => c.index)) + 1 : 0)
              : newChunk.index;
              
            // Create a copy of the previous stream to avoid direct mutation
            const newStream = [...prevStream];
            
            // Format the new chunk
            const formattedNewChunk = {
              index: chunkIndex,
              content: newChunk.chunk
            };
            
            // Find if this index already exists
            const existingIndex = newStream.findIndex(item => item.index === chunkIndex);
            
            // Find the position where this chunk should be inserted (based on index)
            const insertPosition = newStream.findIndex(item => item.index > chunkIndex);
            
            if (existingIndex !== -1) {
              // Replace existing chunk with the same index
              newStream[existingIndex] = formattedNewChunk;
            } else if (insertPosition === -1) {
              // If no larger index found, append to end
              newStream.push(formattedNewChunk);
            } else {
              // Insert at the correct position to maintain order
              newStream.splice(insertPosition, 0, formattedNewChunk);
            }
            
            // Sort chunks by index to ensure proper order
            // This is a safety measure in case chunks arrive out of order
            return newStream.sort((a, b) => a.index - b.index);
          });
        },
        error: (error) => {
          console.error("Error in subscription:", error);
          setError("Failed to receive real-time updates.");
          setIsSubscriptionActive(false);
        },
        complete: () => {
          console.log("Subscription completed.");
          setIsSubscriptionActive(false);
        },
      });
  
    // Add timeout handling for subscription
    const subscriptionTimeoutId = setTimeout(() => {
      console.log("Subscription timeout reached");
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      setIsSubscriptionActive(false);
    }, 60000); // 60 seconds timeout
  
    return () => {
      clearTimeout(subscriptionTimeoutId);
      if (subscriptionRef.current) {
        console.log("Unsubscribing from updates");
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      setIsSubscriptionActive(false);
    };
  };

  // Helper function to combine and sort messages
  const combineAndSortMessages = (arr1: Message[], arr2: Record<string, unknown>[]): Message[] => {
    // Convert arr2 items to ensure they match the Message interface from utils/types
    const convertedArr2 = arr2.map(item => {
      // Create a properly typed Message object that matches Schema["ChatMessage"]["createType"]
      return {
        id: String(item.id || ''),
        content: String(item.content || ''),
        role: (item.role === 'human' || item.role === 'ai' || item.role === 'tool') 
          ? (item.role as "human" | "ai" | "tool") 
          : "ai", // Default to 'ai' if not a valid role
        createdAt: item.createdAt ? new Date(String(item.createdAt)).toISOString() : new Date().toISOString(),
        chatSessionId: String(item.chatSessionId || ''),
        tool_name: item.tool_name as string | undefined,
        tool_call_id: item.tool_call_id as string | undefined,
        tool_calls: item.tool_calls as string | undefined,
        responseComplete: Boolean(item.responseComplete),
        trace: item.trace as string | undefined,
        owner: item.owner as string | undefined,
        chainOfThought: Boolean(item.chainOfThought),
        chatSessionIdDashFieldName: item.chatSessionIdDashFieldName as string | undefined,
        userFeedback: item.userFeedback as "like" | "dislike" | "none" | undefined
      } as Message;
    });
    
    const combinedMessages = [...arr1, ...convertedArr2];
    const uniqueMessages = combinedMessages.filter((message, index, self) =>
        index === self.findIndex((p) => p.id === message.id)
    );
    
    return uniqueMessages.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) {
          console.error("Missing createdAt in message", { a, b });
          return 0;
        }
        return a.createdAt.localeCompare(b.createdAt);
    });
  };

  const subscribeToChatUpdates = (chatSessionId: string) => {
    const sub = amplifyClient.models.ChatMessage.observeQuery({
      filter: {
        chatSessionId: { eq: chatSessionId }
      }
    }).subscribe({
      next: ({ items }) => {
        // Process messages if needed
        try {
          const sortedMessages = combineAndSortMessages([], items);
          
          // Log the messages for debugging
          console.log("Sorted messages:", sortedMessages);
        } catch (error) {
          console.error("Error in subscribeToChatUpdates:", error);
        }
      },
      error: (error) => {
        console.error("Error in chat subscription:", error);
      }
    });
    
    return () => sub.unsubscribe();
  };

  // Perform safety check and invoke Bedrock Agent
  const performSafetyCheck = async () => {
    try {
      // If the location section is expanded, we need to handle the map differently
      if (isLocationVisible) {
        // Temporarily hide the map to prevent initialization conflicts
        setShouldRenderMap(false);
        
        // Small delay to ensure the map is fully unmounted before proceeding
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Reset Leaflet's internal ID counter before performing safety check
      if (typeof window !== 'undefined' && window.L) {
        // @ts-expect-error - Leaflet stores this internally
        window.L._leaflet_id = 0;
        
        // Clean up any existing map containers
        const mapContainers = document.querySelectorAll('.leaflet-container');
        mapContainers.forEach(container => {
          // @ts-expect-error - Accessing Leaflet's internal property
          if (container._leaflet_id) {
            // @ts-expect-error - Accessing Leaflet's internal property
            container._leaflet = null;
            // @ts-expect-error - Accessing Leaflet's internal property
            container._leaflet_id = null;
          }
        });
      }
      
      // Generate a new key for when the map is re-rendered
      setMapKey(Date.now());
      
      setLoading(true);
      setError(null);
      setFormattedResponse([]); // Clear formatted response
      
      // Create a sanitized version of the work order without the safety check fields
      const sanitizedWorkOrder = { ...workOrder };
      delete sanitizedWorkOrder.safetycheckresponse;
      delete sanitizedWorkOrder.safetyCheckPerformedAt;
      
      // Create a prompt that includes the work order details
      const safetyPrompt = `Perform weather, hazard, and emergency checks for the following work order:
                    ${JSON.stringify(sanitizedWorkOrder, null, 2)}
                    Please analyze potential safety risks, weather conditions, and any emergency situations that might affect this work order.`;

      // Create a new chat session
      const testChatSession = await amplifyClient.graphql({
        query: createChatSession,
        variables: { input: {} },
      });

      const newChatSessionId = testChatSession.data.createChatSession.id;
      if (!newChatSessionId) throw new Error("Failed to create chat session");

      // Call the subscription functions
      subscribeToUpdates(newChatSessionId);      
      subscribeToChatUpdates(newChatSessionId);
      
      // Re-enable map rendering after the safety check is complete
      // Only if the location section is expanded
      if (isLocationVisible) {
        setTimeout(() => {
          setShouldRenderMap(true);
        }, 500);
      }
      
      // Fire-and-forget invocation of Bedrock Agent
      await amplifyClient.queries
        .invokeBedrockAgent({
          prompt: safetyPrompt,
          agentId: "OKXTFRR08S",
          agentAliasId: "KZENI6GIPM",
          chatSessionId: newChatSessionId,
        })
        .then(() => {
          console.log("Safety check initiated successfully.");
        })
        .catch((error) => {
          console.error("Error invoking Bedrock Agent:", error);
          setError("Failed to invoke Bedrock Agent.");
        });
    } catch (error) {
      console.error("Error performing safety check:", error);
      setError("Failed to initiate safety check.");
    } finally {
      setLoading(false);
    }
  };

  const performEmergencyCheck = async () => {
    try {
      // If the location section is expanded, we need to handle the map differently
      if (isLocationVisible) {
        // Temporarily hide the map to prevent initialization conflicts
        setShouldRenderMap(false);
        
        // Small delay to ensure the map is fully unmounted before proceeding
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Reset Leaflet's internal ID counter before performing emergency check
      if (typeof window !== 'undefined' && window.L) {
        // @ts-expect-error - Leaflet stores this internally
        window.L._leaflet_id = 0;
        
        // Clean up any existing map containers
        const mapContainers = document.querySelectorAll('.leaflet-container');
        mapContainers.forEach(container => {
          // @ts-expect-error - Accessing Leaflet's internal property
          if (container._leaflet_id) {
            // @ts-expect-error - Accessing Leaflet's internal property
            container._leaflet = null;
            // @ts-expect-error - Accessing Leaflet's internal property
            container._leaflet_id = null;
          }
        });
      }
      
      // Generate a new key for when the map is re-rendered
      setMapKey(Date.now());
      
      setLoadingEmergencies(true);
      // Extract latitude and longitude
      const latitude = workOrder.location_details?.latitude;
      const longitude = workOrder.location_details?.longitude;

      // Validate that both latitude and longitude are defined
      if (latitude === undefined || longitude === undefined) {
        throw new Error('Work order location details are incomplete.');
      }
      
      console.log(`Checking emergencies at: ${latitude}, ${longitude}`);
      
      // Re-enable map rendering after the emergency check is complete
      // Only if the location section is expanded
      if (isLocationVisible) {
        setTimeout(() => {
          setShouldRenderMap(true);
        }, 500);
      }
      
      // TODO: Implement emergency check functionality later
      setLoadingEmergencies(false);

    } catch (error) {
      console.error("Error checking emergencies:", error);
      setError('Failed to initiate emergency check');
    } finally {
      setLoadingEmergencies(false);
    }
  };

  const lat = parseFloat(workOrder.location_details?.latitude || "0");
  const lng = parseFloat(workOrder.location_details?.longitude || "0");

  return (
    <SpaceBetween size="l">
      {/* Error Alert */}
      {error && <ErrorAlert errorMessage={error} dismissible onDismiss={() => setError(null)} />}
      
      {/* Back Button */}
      <Button onClick={() => router.push('/workorders')} variant="link">← Back to List</Button>

      {/* Work Order Details */}
      <Container
        header={<Header>Work Order Details</Header>}
        footer={
          <Button
            variant="primary"
            loading={loading}
            onClick={performSafetyCheck}
          >
            Perform Safety Check
          </Button>
        }
      >
        <SpaceBetween size="m">
          <Box>
            <strong>ID:</strong> {workOrder.work_order_id}
          </Box>
          <Box>
            <strong>Description:</strong> {workOrder.description}
          </Box>
          <Box>
            <strong>Asset:</strong> {workOrder.asset_id}
          </Box>
          <Box>
            <strong>Scheduled Start:</strong>{" "}
            {workOrder.scheduled_start_timestamp}
          </Box>
          <Box>
            <strong>Scheduled Finish:</strong>{" "}
            {workOrder.scheduled_finish_timestamp}
          </Box>
          <Box>
            <strong>Status:</strong>{" "}
            <StatusIndicator
              type={
                workOrder.status === "Approved"
                  ? "success"
                  : workOrder.status === "In Progress"
                  ? "info"
                  : workOrder.status === "Pending"
                  ? "warning"
                  : "error"
              }
            >
              {workOrder.status}
            </StatusIndicator>
          </Box>
          <Box>
            <strong>Priority:</strong> {workOrder.priority}
          </Box>
        </SpaceBetween>
      </Container>

      {/* Location Section */}
      {workOrder.location_name && (
        <ExpandableSection
          headerText={
            <SpaceBetween direction="horizontal" size="xs">
              <span>Location Details</span>
            </SpaceBetween>
          }
          expanded={isLocationVisible}
          onChange={({ detail }) => {
            // First update the visibility state
            setIsLocationVisible(detail.expanded);
            
            // If we're collapsing the section, immediately hide the map
            if (!detail.expanded) {
              setShouldRenderMap(false);
              return;
            }
            
            // If we're expanding, first clean up any existing map instances
            if (typeof window !== 'undefined' && window.L) {
              // @ts-expect-error - Leaflet stores this internally
              window.L._leaflet_id = 0;
              
              // Clean up any existing map containers
              const mapContainers = document.querySelectorAll('.leaflet-container');
              mapContainers.forEach(container => {
                // @ts-expect-error - Accessing Leaflet's internal property
                if (container._leaflet_id) {
                  // @ts-expect-error - Accessing Leaflet's internal property
                  container._leaflet = null;
                  // @ts-expect-error - Accessing Leaflet's internal property
                  container._leaflet_id = null;
                }
              });
            }
            
            // Generate a new key for the map
            setMapKey(Date.now());
            
            // Add a delay before rendering the map to ensure DOM is ready
            setTimeout(() => {
              setShouldRenderMap(true);
            }, 200);
          }}
        >
          <SpaceBetween size="l">
            {isLocationVisible && shouldRenderMap && (
              <div 
                style={{ height: '500px', width: '100%' }}
                id={`map-container-${mapKey}`} // Use a unique ID for the container
              >
                {workOrder.location_details?.latitude && workOrder.location_details?.longitude ? (
                  <UnifiedMap 
                    key={`map-${mapKey}`} // Use the state variable for consistency
                    centerPoint={[lng, lat]}
                    description={workOrder.location_name} 
                    emergencies={emergencies}
                  />
                ) : (
                  "No location coordinates available."
                )}
              </div>
            )}
            <Button
              variant="primary"
              loading={loadingEmergencies}
              onClick={performEmergencyCheck}
              disabled={!isLocationVisible} // Disable button if location section is collapsed
            >
              Load Emergency Warnings
            </Button>
          </SpaceBetween>
        </ExpandableSection>
      )}

      <ExpandableSection headerText="Safety Agent Response" expanded={true}>
        {isSubscriptionActive ? (
          formattedResponse.length > 0 ? (
            <div
              className="messages"
              role="region"
              aria-label="Chat"
              style={{
                overflowY: 'auto', // Enable vertical scrolling
                height: '100%',    // Take full height
                padding: '16px',   // Add padding for better spacing
                backgroundColor: '#f9f9f9', // Light background for better readability
                borderRadius: '8px', // Rounded corners for a clean look
                border: '1px solid #ddd', // Subtle border for separation
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}
            >        
              <div className="prose !max-w-none w-full">
                {formattedResponse.map((chunk) => (
                  <ReactMarkdown key={chunk.index}>{chunk.content}</ReactMarkdown>            
                ))}
              </div>
            </div>
          ) : (
            <Box>Waiting for response...</Box>
          )
        ) : workOrder?.safetycheckresponse ? (
          <div 
            className="safety-check-response"
            dangerouslySetInnerHTML={{ 
              __html: workOrder.safetycheckresponse
                .replace(/^"|"$/g, '') // Remove leading and trailing quotes
                .replace(/\\n/g, '') // Remove \n characters
                .replace(/\\u00b0C/g, '°C') // Replace \u00b0C with °C (escaped version)
                .replace(/\u00b0C/g, '°C')
            }} 
          />
        ) : (
          <Box>No safety check response available.</Box>
        )}
      </ExpandableSection>
    </SpaceBetween>
  );
};

export default WorkOrderDetails;
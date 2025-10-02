/**
 * Example usage of the inspectionService
 * This file demonstrates how to use the inspection service in React components
 */

import { inspectionService } from './inspectionService';

// Example 1: Starting an inspection
export const startEC2Inspection = async () => {
  try {
    const inspectionData = {
      serviceType: 'EC2',
      assumeRoleArn: 'arn:aws:iam::123456789012:role/InspectionRole',
      inspectionConfig: {
        regions: ['us-east-1', 'us-west-2'],
        includeSecurityGroups: true,
        includeInstances: true
      }
    };

    const result = await inspectionService.startInspection(inspectionData);
    
    if (result.success) {
      console.log('Inspection started:', result.data.inspectionId);
      return result.data.inspectionId;
    } else {
      console.error('Failed to start inspection:', result.error);
      throw new Error(result.error.message);
    }
  } catch (error) {
    console.error('Error starting inspection:', error);
    throw error;
  }
};

// Example 2: Polling for inspection status with progress updates
export const monitorInspectionProgress = (inspectionId, onProgressUpdate) => {
  const polling = inspectionService.pollInspectionStatus(
    inspectionId,
    (status) => {
      // Called on each status update
      console.log('Inspection progress:', status.progress?.percentage || 0);
      if (onProgressUpdate) {
        onProgressUpdate(status);
      }
    },
    (finalResult) => {
      // Called when inspection completes
      console.log('Inspection completed:', finalResult);
      if (onProgressUpdate) {
        onProgressUpdate({ ...finalResult, completed: true });
      }
    },
    (error) => {
      // Called on error
      console.error('Inspection polling error:', error);
      if (onProgressUpdate) {
        onProgressUpdate({ error: error.message });
      }
    }
  );

  // Return control object to allow stopping
  return polling;
};

// Example 3: Using Promise-based completion waiting
export const waitForInspectionWithProgress = async (inspectionId) => {
  try {
    const result = await inspectionService.waitForInspectionCompletion(
      inspectionId,
      (progress) => {
        console.log(`Progress: ${progress.progress?.percentage || 0}%`);
        console.log(`Current step: ${progress.currentStep || 'Unknown'}`);
      }
    );

    console.log('Inspection completed with results:', result);
    return result;
  } catch (error) {
    console.error('Inspection failed:', error);
    throw error;
  }
};

// Example 4: Getting inspection history with filters
export const getRecentInspections = async (serviceType = null, limit = 10) => {
  try {
    const params = {
      limit,
      ...(serviceType && { serviceType })
    };

    const result = await inspectionService.getInspectionHistory(params);
    
    if (result.success) {
      return result.data.inspections || result.inspections;
    } else {
      throw new Error(result.error?.message || 'Failed to get inspection history');
    }
  } catch (error) {
    console.error('Error getting inspection history:', error);
    throw error;
  }
};

// Example 5: Complete inspection workflow
export const runCompleteInspectionWorkflow = async (inspectionData) => {
  try {
    // Step 1: Start inspection
    console.log('Starting inspection...');
    const startResult = await inspectionService.startInspection(inspectionData);
    const inspectionId = startResult.data?.inspectionId || startResult.inspectionId;

    if (!inspectionId) {
      throw new Error('No inspection ID returned');
    }

    // Step 2: Monitor progress
    console.log('Monitoring progress...');
    const result = await inspectionService.waitForInspectionCompletion(
      inspectionId,
      (progress) => {
        const percentage = progress.progress?.percentage || 0;
        const currentStep = progress.currentStep || 'Initializing';
        console.log(`${percentage}% - ${currentStep}`);
      }
    );

    // Step 3: Return final results
    console.log('Inspection completed successfully');
    return {
      inspectionId,
      results: result.data || result,
      success: true
    };

  } catch (error) {
    console.error('Inspection workflow failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Example 6: React Hook usage pattern
export const useInspectionStatus = (inspectionId) => {
  const [status, setStatus] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!inspectionId) return;

    let polling = null;

    const startPolling = () => {
      polling = inspectionService.pollInspectionStatus(
        inspectionId,
        (statusUpdate) => {
          setStatus(statusUpdate);
          setLoading(false);
        },
        (finalResult) => {
          setStatus(finalResult);
          setLoading(false);
        },
        (err) => {
          setError(err.message);
          setLoading(false);
        }
      );
    };

    startPolling();

    // Cleanup function
    return () => {
      if (polling) {
        polling.stop();
      }
    };
  }, [inspectionId]);

  return { status, loading, error };
};
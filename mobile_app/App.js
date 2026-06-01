import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { API_BASE_URL } from "./src/config";

const UPLOAD_ENDPOINT = "/upload-image";

const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return "Not available";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const displayStatus = (status) => status.charAt(0).toUpperCase() + status.slice(1);

const formatNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number") return value.toString();
  return Number.isInteger(value) ? value.toString() : value.toFixed(4);
};

const MetadataRow = ({ label, value }) => (
  <View style={styles.metadataRow}>
    <Text style={styles.metadataLabel}>{label}</Text>
    <Text style={styles.metadataValue} selectable>
      {value || "Not available"}
    </Text>
  </View>
);

const PipelineStep = ({ label, status, tone }) => (
  <View style={styles.pipelineStep}>
    <View style={[styles.pipelineDot, styles[`${tone}Dot`]]} />
    <View style={styles.pipelineTextBlock}>
      <Text style={styles.pipelineLabel}>{label}</Text>
      <Text style={[styles.pipelineStatus, styles[`${tone}Text`]]}>{status}</Text>
    </View>
  </View>
);

export default function App() {
  const fileInputRef = useRef(null);
  const previewUrlsRef = useRef([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadTimestamp, setUploadTimestamp] = useState(null);
  const [responseStatusCode, setResponseStatusCode] = useState(null);
  const [uploadHistory, setUploadHistory] = useState([]);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
      previewUrlsRef.current = [];
    };
  }, []);

  const resetUploadMetadata = () => {
    setUploadResult(null);
    setUploadTimestamp(null);
    setResponseStatusCode(null);
  };

  const clearAll = () => {
    previewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    previewUrlsRef.current = [];
    setSelectedFiles([]);
    resetUploadMetadata();

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelection = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const nextFiles = files.map((file, index) => {
      const previewUrl = URL.createObjectURL(file);
      return {
        id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${index}`,
        file,
        previewUrl,
        name: file.name,
        type: file.type,
        size: file.size,
        status: "pending",
        responseStatusCode: null,
        backendStatus: null,
        savedFilename: null,
        savedPath: null,
        azureVision: null,
        inspectionResult: null,
        uploadedAt: null,
        error: null,
      };
    });

    console.log("selected files", files);
    console.log("preview URLs", nextFiles.map((item) => item.previewUrl));

    previewUrlsRef.current = [...previewUrlsRef.current, ...nextFiles.map((item) => item.previewUrl)];
    setSelectedFiles((currentFiles) => [...currentFiles, ...nextFiles]);
    resetUploadMetadata();
    event.target.value = "";
  };

  const pickImages = () => {
    fileInputRef.current?.click();
  };

  const takePhoto = () => {
    Alert.alert("Camera unavailable", "Camera capture is not available in this web demo. Please use Gallery.");
  };

  const updateSelectedFileStatus = (id, patch) => {
    setSelectedFiles((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const uploadAllImages = async () => {
    console.log("upload button clicked");
    console.log("selectedFiles before upload", selectedFiles);

    if (selectedFiles.length === 0) {
      Alert.alert("No images selected", "Choose one or more images from your gallery first.");
      return;
    }

    const uploadedItems = [];

    try {
      setUploading(true);
      resetUploadMetadata();

      for (const item of selectedFiles) {
        updateSelectedFileStatus(item.id, { status: "uploading", error: null });

        try {
          const formData = new FormData();
          formData.append("image", item.file, item.file.name);

          const frontendTimestamp = new Date().toISOString();
          const response = await fetch(`${API_BASE_URL}${UPLOAD_ENDPOINT}`, {
            method: "POST",
            body: formData,
          });

          console.log("response.status", response.status);
          setResponseStatusCode(response.status);
          setUploadTimestamp(frontendTimestamp);

          const data = await response.json();
          console.log("backend response JSON", data);

          if (!response.ok) {
            const message = data.detail || "Upload failed";
            updateSelectedFileStatus(item.id, {
              status: "failed",
              responseStatusCode: response.status,
              backendStatus: data.status || null,
              azureVision: data.azure_vision || null,
              inspectionResult: data.inspection_result || null,
              uploadedAt: frontendTimestamp,
              error: message,
            });
            uploadedItems.push({
              originalFilename: item.name,
              savedFilename: null,
              savedPath: null,
            backendStatus: data.status || null,
            azureVision: data.azure_vision || null,
            inspectionResult: data.inspection_result || null,
            responseStatusCode: response.status,
            uploadedAt: frontendTimestamp,
            status: "failed",
            });
            continue;
          }

          updateSelectedFileStatus(item.id, {
            status: "success",
            responseStatusCode: response.status,
            backendStatus: data.status,
            savedFilename: data.filename,
            savedPath: data.saved_path,
            azureVision: data.azure_vision || null,
            inspectionResult: data.inspection_result || null,
            uploadedAt: frontendTimestamp,
          });
          setUploadResult(data);
          uploadedItems.push({
            originalFilename: item.name,
            savedFilename: data.filename,
            savedPath: data.saved_path,
            backendStatus: data.status,
            azureVision: data.azure_vision || null,
            inspectionResult: data.inspection_result || null,
            responseStatusCode: response.status,
            uploadedAt: frontendTimestamp,
            status: "success",
          });
        } catch (error) {
          console.log("upload error", error);
          const frontendTimestamp = new Date().toISOString();
          updateSelectedFileStatus(item.id, {
            status: "failed",
            responseStatusCode: null,
            uploadedAt: frontendTimestamp,
            error: error.message,
          });
          uploadedItems.push({
            originalFilename: item.name,
            savedFilename: null,
            savedPath: null,
            backendStatus: null,
            responseStatusCode: null,
            uploadedAt: frontendTimestamp,
            status: "failed",
          });
        }
      }

      setUploadHistory((history) => [...uploadedItems.reverse(), ...history].slice(0, 12));

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      Alert.alert("Upload complete", `Processed ${selectedFiles.length} image(s).`);
    } finally {
      setUploading(false);
    }
  };

  const imageSelected = selectedFiles.length > 0;
  const successfulUploadCount = selectedFiles.filter((item) => item.status === "success").length;
  const failedUploadCount = selectedFiles.filter((item) => item.status === "failed").length;
  const uploadComplete =
    imageSelected && !uploading && successfulUploadCount + failedUploadCount === selectedFiles.length;
  const backendStepStatus = uploading ? "Uploading" : uploadComplete ? "Completed" : "Waiting";
  const backendStepTone = uploading ? "pending" : uploadComplete ? "completed" : "waiting";
  const analyzedFile =
    selectedFiles.find((item) => item.status === "success" && item.inspectionResult) ||
    (uploadResult?.inspection_result
      ? {
          name: uploadResult.filename,
          savedFilename: uploadResult.filename,
          savedPath: uploadResult.saved_path,
          inspectionResult: uploadResult.inspection_result,
        }
      : null);
  const inspectionResult = analyzedFile?.inspectionResult;
  const patchcoreResult = inspectionResult?.patchcore_result;
  const llmResult = inspectionResult?.llm_result;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/*"
        multiple
        style={{ display: "none" }}
        onChange={handleFileSelection}
      />

      <ScrollView style={styles.safeArea} contentContainerStyle={styles.screen}>
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.modeBadge}>Local Demo Mode</Text>
            <Text style={styles.title}>SignalFlow Visual Inspection</Text>
            <Text style={styles.subtitle}>
              Upload field images and prepare them for AI-powered anomaly analysis.
            </Text>
          </View>
          <View style={styles.heroMetric}>
            <Text style={styles.heroMetricLabel}>Backend</Text>
            <Text style={styles.heroMetricValue}>{API_BASE_URL}</Text>
            <Text style={styles.heroMetricHint}>Endpoint {UPLOAD_ENDPOINT}</Text>
          </View>
        </View>

        <View style={styles.dashboardGrid}>
          <View style={styles.mainColumn}>
            <View style={styles.uploadCard}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.sectionEyebrow}>Image Intake</Text>
                  <Text style={styles.cardTitle}>Upload Area</Text>
                </View>
                <Text style={styles.cardPill}>
                  {imageSelected ? `${selectedFiles.length} image(s) selected` : "Awaiting images"}
                </Text>
              </View>

              <View style={styles.previewFrame}>
                {selectedFiles.length > 0 ? (
                  <View style={styles.previewGrid}>
                    {selectedFiles.map((item) => (
                      <View key={item.id} style={styles.previewTile}>
                        <Image source={{ uri: item.previewUrl }} style={styles.previewImage} />
                        <View style={styles.previewOverlay}>
                          <Text style={styles.previewFilename} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.previewStatus}>{displayStatus(item.status)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyPreview}>
                    <Feather name="image" size={54} color="#5eead4" />
                    <Text style={styles.emptyPreviewTitle}>No inspection images selected</Text>
                    <Text style={styles.emptyPreviewText}>Choose one or more gallery images for this batch.</Text>
                  </View>
                )}
              </View>

              <View style={styles.actions}>
                <Pressable style={styles.secondaryButton} onPress={pickImages}>
                  <Feather name="image" size={20} color="#e2e8f0" />
                  <Text style={styles.secondaryButtonText}>Gallery / Select Images</Text>
                </Pressable>

                <Pressable style={styles.secondaryButton} onPress={takePhoto}>
                  <Feather name="camera" size={20} color="#e2e8f0" />
                  <Text style={styles.secondaryButtonText}>Take Photo</Text>
                </Pressable>
              </View>

              <Pressable
                style={[styles.primaryButton, (selectedFiles.length === 0 || uploading) && styles.disabledButton]}
                onPress={uploadAllImages}
                disabled={selectedFiles.length === 0 || uploading}
              >
                {uploading ? (
                  <>
                    <ActivityIndicator color="#06111f" />
                    <Text style={styles.primaryButtonText}>Uploading Batch...</Text>
                  </>
                ) : (
                  <>
                    <Feather name="upload-cloud" size={21} color="#06111f" />
                    <Text style={styles.primaryButtonText}>Upload All</Text>
                  </>
                )}
              </Pressable>

              {(selectedFiles.length > 0 || uploadResult) && (
                <Pressable style={styles.clearButton} onPress={clearAll} disabled={uploading}>
                  <Feather name="trash-2" size={18} color="#cbd5e1" />
                  <Text style={styles.clearButtonText}>Clear All</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.metadataCard}>
              <Text style={styles.metadataTitle}>Selected Image Metadata</Text>
              {selectedFiles.length > 0 ? (
                selectedFiles.map((item, index) => (
                  <View key={item.id} style={styles.fileMetadataBlock}>
                    <Text style={styles.fileMetadataTitle}>Image {index + 1}</Text>
                    <MetadataRow label="Original filename" value={item.name} />
                    <MetadataRow label="MIME type" value={item.type} />
                    <MetadataRow label="File size" value={formatFileSize(item.size)} />
                    <MetadataRow label="Preview URL" value={item.previewUrl} />
                    <MetadataRow label="Upload status" value={displayStatus(item.status)} />
                    <MetadataRow label="Saved filename" value={item.savedFilename} />
                    <MetadataRow label="Saved path" value={item.savedPath} />
                    <MetadataRow label="Response status code" value={item.responseStatusCode?.toString()} />
                    <View style={styles.azureVisionSection}>
                      <Text style={styles.azureVisionTitle}>Azure Vision Classification</Text>
                      <MetadataRow label="Label" value={item.azureVision?.label} />
                      <MetadataRow
                        label="Confidence"
                        value={
                          item.azureVision?.confidence !== undefined && item.azureVision?.confidence !== null
                            ? item.azureVision.confidence.toString()
                            : null
                        }
                      />
                      <MetadataRow label="Status" value={item.azureVision?.status} />
                      <MetadataRow label="Reason" value={item.azureVision?.reason} />
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.metadataValue}>Waiting for image selection</Text>
              )}
            </View>
          </View>

          <View style={styles.sideColumn}>
            <View style={styles.pipelineCard}>
              <Text style={styles.metadataTitle}>Pipeline Progress</Text>
              <PipelineStep
                label="Images Selected"
                status={imageSelected ? "Completed" : "Waiting"}
                tone={imageSelected ? "completed" : "waiting"}
              />
              <PipelineStep label="Sent to Backend" status={backendStepStatus} tone={backendStepTone} />
              <PipelineStep
                label="Saved Successfully"
                status={uploadComplete ? `${successfulUploadCount} Success / ${failedUploadCount} Failed` : "Pending"}
                tone={uploadComplete ? "completed" : "pending"}
              />
              <PipelineStep
                label="Ready for AI Analysis"
                status={uploadComplete ? "Completed" : "Pending"}
                tone={uploadComplete ? "completed" : "pending"}
              />
            </View>

            <View style={styles.metadataCard}>
              <Text style={styles.metadataTitle}>Latest Backend Response</Text>
              <MetadataRow label="Upload status" value={uploadResult?.status} />
              <MetadataRow label="Saved filename" value={uploadResult?.filename} />
              <MetadataRow label="Saved path" value={uploadResult?.saved_path} />
              <MetadataRow label="Backend URL" value={API_BASE_URL} />
              <MetadataRow label="Endpoint" value={UPLOAD_ENDPOINT} />
              <MetadataRow label="Upload timestamp" value={uploadTimestamp} />
              <MetadataRow label="Response status code" value={responseStatusCode?.toString()} />
              <View style={styles.azureVisionSection}>
                <Text style={styles.azureVisionTitle}>Azure Vision Classification</Text>
                <MetadataRow label="Label" value={uploadResult?.azure_vision?.label} />
                <MetadataRow
                  label="Confidence"
                  value={
                    uploadResult?.azure_vision?.confidence !== undefined &&
                    uploadResult?.azure_vision?.confidence !== null
                      ? uploadResult.azure_vision.confidence.toString()
                      : null
                  }
                />
                <MetadataRow label="Status" value={uploadResult?.azure_vision?.status} />
                <MetadataRow label="Reason" value={uploadResult?.azure_vision?.reason} />
              </View>
            </View>

            <View style={styles.metadataCard}>
              <Text style={styles.metadataTitle}>Upload History</Text>
              {uploadHistory.length > 0 ? (
                uploadHistory.map((item, index) => (
                  <View key={`${item.originalFilename}-${item.uploadedAt}-${index}`} style={styles.historyItem}>
                    <Text style={styles.historyFilename}>{item.originalFilename}</Text>
                    <Text style={styles.historyMeta}>Saved: {item.savedFilename || "Not saved"}</Text>
                    <Text style={styles.historyMeta}>Backend status: {item.backendStatus || "N/A"}</Text>
                    <Text style={styles.historyMeta}>HTTP {item.responseStatusCode || "N/A"} - {item.uploadedAt}</Text>
                    <Text style={styles.historyMeta}>Status: {item.status}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.metadataValue}>No uploads yet</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.metadataCard}>
            <Text style={styles.metadataTitle}>AI Analysis</Text>
            <MetadataRow label="Image analyzed" value={analyzedFile?.name} />
            <MetadataRow label="Saved filename" value={analyzedFile?.savedFilename} />
            <MetadataRow label="Saved path" value={analyzedFile?.savedPath} />
            <MetadataRow label="Pipeline status" value={inspectionResult?.status} />
            <MetadataRow label="PatchCore status" value={patchcoreResult?.status} />
            <MetadataRow label="Prediction" value={patchcoreResult?.prediction} />
            <MetadataRow label="Anomaly score" value={formatNumber(patchcoreResult?.pred_score)} />
            <MetadataRow label="Threshold" value={formatNumber(patchcoreResult?.threshold_used)} />
            <MetadataRow label="LLM status" value={llmResult?.status} />
            <MetadataRow label="LLM decision" value={llmResult?.decision} />
            <MetadataRow
              label="Explanation"
              value={llmResult?.explanation || patchcoreResult?.message}
            />
            <MetadataRow label="Recommended action" value={llmResult?.recommended_action} />
            <MetadataRow label="Registry JSON" value={inspectionResult?.registry_json_path} />
            <MetadataRow label="Heatmap" value={patchcoreResult?.heatmap_path} />
          </View>

          <View style={styles.metadataCard}>
            <Text style={styles.metadataTitle}>Future Azure Deployment</Text>
            <MetadataRow label="Current" value="Laptop FastAPI backend + local uploaded_images folder" />
            <MetadataRow
              label="Future"
              value="Azure App Service / Container Apps + Azure Blob Storage + AI model endpoint + database"
            />
          </View>
        </View>

        {uploadHistory.length > 0 && (
          <View style={styles.successBanner}>
            <Feather name="check-circle" size={22} color="#34d399" />
            <View>
              <Text style={styles.successTitle}>Latest batch processed</Text>
              <Text style={styles.successText}>
                {successfulUploadCount} success, {failedUploadCount} failed
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#06111f",
  },
  screen: {
    flexGrow: 1,
    padding: 28,
    gap: 22,
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
  },
  hero: {
    borderRadius: 18,
    padding: 28,
    gap: 20,
    backgroundColor: "#0d1b2f",
    borderWidth: 1,
    borderColor: "#1f3555",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "stretch",
  },
  heroCopy: {
    flex: 1,
    gap: 8,
    justifyContent: "center",
  },
  modeBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 7,
    color: "#a7f3d0",
    backgroundColor: "#0f3d34",
    borderWidth: 1,
    borderColor: "#1f8a70",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    color: "#f8fafc",
    fontSize: 42,
    fontWeight: "800",
    lineHeight: 48,
  },
  subtitle: {
    color: "#b6c5d8",
    fontSize: 17,
    lineHeight: 25,
    maxWidth: 680,
  },
  heroMetric: {
    minWidth: 280,
    borderRadius: 14,
    padding: 18,
    gap: 8,
    backgroundColor: "#081424",
    borderWidth: 1,
    borderColor: "#203657",
    justifyContent: "center",
  },
  heroMetricLabel: {
    color: "#7dd3fc",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  heroMetricValue: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
  },
  heroMetricHint: {
    color: "#8ea3bb",
    fontSize: 13,
  },
  dashboardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 22,
    alignItems: "flex-start",
  },
  mainColumn: {
    flex: 1.45,
    minWidth: 0,
    gap: 18,
  },
  sideColumn: {
    flex: 1,
    minWidth: 320,
    gap: 18,
  },
  uploadCard: {
    borderRadius: 18,
    padding: 18,
    gap: 16,
    backgroundColor: "#0d1b2f",
    borderWidth: 1,
    borderColor: "#1f3555",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  sectionEyebrow: {
    color: "#5eead4",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  cardTitle: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "800",
  },
  cardPill: {
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 7,
    color: "#cbd5e1",
    backgroundColor: "#13263f",
    borderWidth: 1,
    borderColor: "#2b476f",
    fontSize: 12,
    fontWeight: "800",
  },
  previewFrame: {
    minHeight: 360,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#081424",
    borderWidth: 1,
    borderColor: "#243b5f",
  },
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 12,
  },
  previewTile: {
    width: 180,
    height: 150,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0f2137",
    borderWidth: 1,
    borderColor: "#25446b",
  },
  previewImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  previewOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 8,
    gap: 3,
    backgroundColor: "rgba(6, 17, 31, 0.82)",
  },
  previewFilename: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "800",
  },
  previewStatus: {
    color: "#99f6e4",
    fontSize: 12,
    fontWeight: "800",
  },
  emptyPreview: {
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 28,
  },
  emptyPreviewTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyPreviewText: {
    color: "#9fb0c5",
    fontSize: 15,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#315176",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#10233b",
  },
  secondaryButtonText: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "700",
  },
  primaryButton: {
    minHeight: 60,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#5eead4",
  },
  disabledButton: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#06111f",
    fontSize: 16,
    fontWeight: "800",
  },
  clearButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#0b182b",
    borderWidth: 1,
    borderColor: "#315176",
  },
  clearButtonText: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "800",
  },
  metadataCard: {
    borderRadius: 16,
    padding: 18,
    gap: 12,
    backgroundColor: "#0d1b2f",
    borderWidth: 1,
    borderColor: "#1f3555",
  },
  pipelineCard: {
    borderRadius: 16,
    padding: 18,
    gap: 14,
    backgroundColor: "#0d1b2f",
    borderWidth: 1,
    borderColor: "#1f3555",
  },
  metadataTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800",
  },
  metadataRow: {
    gap: 5,
    paddingTop: 2,
  },
  metadataLabel: {
    color: "#8ea3bb",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  metadataValue: {
    color: "#e2e8f0",
    fontSize: 14,
    lineHeight: 20,
  },
  fileMetadataBlock: {
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: "#091629",
    borderWidth: 1,
    borderColor: "#1d3150",
  },
  fileMetadataTitle: {
    color: "#5eead4",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  azureVisionSection: {
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: "#10233b",
    borderWidth: 1,
    borderColor: "#315176",
  },
  azureVisionTitle: {
    color: "#7dd3fc",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  historyItem: {
    borderRadius: 12,
    padding: 12,
    gap: 4,
    backgroundColor: "#091629",
    borderWidth: 1,
    borderColor: "#1d3150",
  },
  historyFilename: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "800",
  },
  historyMeta: {
    color: "#9fb0c5",
    fontSize: 12,
    lineHeight: 18,
  },
  pipelineStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#091629",
    borderWidth: 1,
    borderColor: "#1d3150",
  },
  pipelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  completedDot: {
    backgroundColor: "#34d399",
  },
  pendingDot: {
    backgroundColor: "#fbbf24",
  },
  waitingDot: {
    backgroundColor: "#94a3b8",
  },
  pipelineTextBlock: {
    flex: 1,
    gap: 3,
  },
  pipelineLabel: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "800",
  },
  pipelineStatus: {
    fontSize: 13,
    fontWeight: "800",
  },
  completedText: {
    color: "#86efac",
  },
  pendingText: {
    color: "#fde68a",
  },
  waitingText: {
    color: "#cbd5e1",
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 22,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#06281f",
    borderWidth: 1,
    borderColor: "#145c49",
  },
  successTitle: {
    color: "#d1fae5",
    fontSize: 15,
    fontWeight: "800",
  },
  successText: {
    color: "#99f6e4",
    fontSize: 14,
  },
});

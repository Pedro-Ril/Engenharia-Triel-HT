"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  AlertCircle,
  FileText,
  UploadCloud,
  X,
} from "lucide-react";

import styles from "./FileUpload.module.css";

interface FileUploadProps {
  id?: string;
  name?: string;
  label?: string;
  description?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  maxSizeMB?: number;
  files?: File[];
  hasError?: boolean;
  onFilesChange?: (files: File[]) => void;
  className?: string;
}

function formatFileSize(bytes: number) {
  if (bytes === 0) {
    return "0 KB";
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileMatchesAccept(file: File, accept?: string) {
  if (!accept) {
    return true;
  }

  const acceptedTypes = accept
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return acceptedTypes.some((acceptedType) => {
    if (acceptedType.startsWith(".")) {
      return file.name
        .toLowerCase()
        .endsWith(acceptedType);
    }

    if (acceptedType.endsWith("/*")) {
      const category = acceptedType.replace("/*", "");

      return file.type
        .toLowerCase()
        .startsWith(`${category}/`);
    }

    return file.type.toLowerCase() === acceptedType;
  });
}

function removeDuplicates(files: File[]) {
  return files.filter(
    (file, index, collection) =>
      collection.findIndex(
        (currentFile) =>
          currentFile.name === file.name &&
          currentFile.size === file.size &&
          currentFile.lastModified === file.lastModified
      ) === index
  );
}

export function FileUpload({
  id = "file-upload",
  name = "files",
  label = "Selecionar arquivos",
  description = "Arraste os arquivos para esta área ou clique para procurar.",
  accept,
  multiple = false,
  disabled = false,
  maxSizeMB = 10,
  files,
  hasError = false,
  onFilesChange,
  className = "",
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [internalFiles, setInternalFiles] =
    useState<File[]>([]);

  const [dragging, setDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const controlled = files !== undefined;

  const selectedFiles = controlled
    ? files
    : internalFiles;

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  function updateFiles(nextFiles: File[]) {
    if (!controlled) {
      setInternalFiles(nextFiles);
    }

    onFilesChange?.(nextFiles);
  }

  function processFiles(incomingFiles: File[]) {
    setErrorMessage("");

    const validFiles: File[] = [];
    const errors: string[] = [];

    incomingFiles.forEach((file) => {
      if (!fileMatchesAccept(file, accept)) {
        errors.push(
          `${file.name}: formato não permitido.`
        );

        return;
      }

      if (file.size > maxSizeBytes) {
        errors.push(
          `${file.name}: excede o limite de ${maxSizeMB} MB.`
        );

        return;
      }

      validFiles.push(file);
    });

    if (errors.length > 0) {
      setErrorMessage(errors.join(" "));
    }

    if (validFiles.length === 0) {
      return;
    }

    const nextFiles = multiple
      ? removeDuplicates([
          ...selectedFiles,
          ...validFiles,
        ])
      : [validFiles[0]];

    updateFiles(nextFiles);
  }

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const incomingFiles = Array.from(
      event.target.files ?? []
    );

    processFiles(incomingFiles);

    event.target.value = "";
  }

  function handleDragOver(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    if (!disabled) {
      setDragging(true);
    }
  }

  function handleDragLeave(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();
    setDragging(false);
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();
    setDragging(false);

    if (disabled) {
      return;
    }

    processFiles(
      Array.from(event.dataTransfer.files)
    );
  }

  function removeFile(indexToRemove: number) {
    const nextFiles = selectedFiles.filter(
      (_, index) => index !== indexToRemove
    );

    updateFiles(nextFiles);
    setErrorMessage("");
  }

  const uploadClassName = [
    styles.upload,
    dragging ? styles.dragging : "",
    hasError || errorMessage ? styles.error : "",
    disabled ? styles.disabled : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.wrapper}>
      <div
        className={uploadClassName}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className={styles.input}
          onChange={handleInputChange}
        />

        <button
          type="button"
          className={styles.selectButton}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <span
            className={styles.uploadIcon}
            aria-hidden="true"
          >
            <UploadCloud />
          </span>

          <span className={styles.uploadContent}>
            <strong className={styles.label}>
              {label}
            </strong>

            <span className={styles.description}>
              {description}
            </span>

            <span className={styles.rules}>
              Limite de {maxSizeMB} MB por arquivo
            </span>
          </span>
        </button>
      </div>

      {errorMessage && (
        <div
          className={styles.errorMessage}
          role="alert"
        >
          <AlertCircle aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div
          className={styles.fileList}
          aria-label="Arquivos selecionados"
        >
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className={styles.fileItem}
            >
              <span
                className={styles.fileIcon}
                aria-hidden="true"
              >
                <FileText />
              </span>

              <span className={styles.fileInformation}>
                <strong className={styles.fileName}>
                  {file.name}
                </strong>

                <span className={styles.fileSize}>
                  {formatFileSize(file.size)}
                </span>
              </span>

              <button
                type="button"
                className={styles.removeButton}
                aria-label={`Remover arquivo ${file.name}`}
                disabled={disabled}
                onClick={() => removeFile(index)}
              >
                <X />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
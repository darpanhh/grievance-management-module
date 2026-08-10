import { useRef, useState } from 'react';

const MAX_FILES = 3;
const MAX_SIZE = 5 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'xls', 'xlsx'];

const fileIsAllowed = (file) => ACCEPTED_EXTENSIONS.includes(file.name.split('.').pop()?.toLowerCase());
const isPreviewable = (file) => /\.(png|jpe?g|gif|webp|pdf)$/.test(file.name.toLowerCase());

const FileUpload = ({ files, onChange, disabled = false, hideDropZone = false }) => {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [previewFile, setPreviewFile] = useState(null);

  const addFiles = (incoming) => {
    const selected = Array.from(incoming || []);
    const messages = [];
    const valid = selected.filter((file) => {
      if (!fileIsAllowed(file)) {
        messages.push(`${file.name}: unsupported file type.`);
        return false;
      }
      if (file.size > MAX_SIZE) {
        messages.push(`${file.name}: files must be 5 MB or smaller.`);
        return false;
      }
      return true;
    });

    const remaining = MAX_FILES - files.length;
    if (valid.length > remaining) messages.push(`You can attach up to ${MAX_FILES} files.`);
    const next = [...files, ...valid.slice(0, Math.max(remaining, 0))];
    setError(messages.join(' '));
    if (next.length !== files.length) onChange(next);
  };

  const removeFile = (index) => {
    setError('');
    onChange(files.filter((_, fileIndex) => fileIndex !== index));
  };

  const getFilePreviewUrl = (file) => URL.createObjectURL(file);
  const isImage = (file) => /\.(png|jpe?g|gif|webp)$/i.test(file.name);
  const isPdf = (file) => /\.pdf$/i.test(file.name);

  return (
    <div className="file-upload">
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        disabled={disabled}
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xls,.xlsx"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      {!hideDropZone && (
        <div
          className={`drop-zone ${isDragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(event) => {
            if (!disabled && (event.key === 'Enter' || event.key === ' ')) inputRef.current?.click();
          }}
          onDragOver={(event) => { event.preventDefault(); if (!disabled) setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            if (!disabled) addFiles(event.dataTransfer.files);
          }}
        >
          <span className="drop-zone-icon" aria-hidden="true">↑</span>
          <strong>Drop supporting files here, or click to browse</strong>
          <span>Up to 3 files, 5 MB each. PDF, Word or Image files only.</span>
        </div>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      {files.length > 0 && (
        <ul className="file-list" aria-label="Selected attachments">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`}>
              <span className="file-list-item">
                {isPreviewable(file) ? (
                  <button type="button" className="file-name-preview-btn" onClick={() => setPreviewFile(file)}>
                    <strong>{file.name}</strong>
                  </button>
                ) : (
                  <strong>{file.name}</strong>
                )}
                <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
              </span>
              <button type="button" onClick={() => removeFile(index)} disabled={disabled} aria-label={`Remove ${file.name}`}>Remove</button>
            </li>
          ))}
        </ul>
      )}

      {previewFile && (
        <div className="file-preview-modal" onClick={() => setPreviewFile(null)}>
          <div className="file-preview-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="file-preview-close" onClick={() => setPreviewFile(null)}>&times;</button>
            {isImage(previewFile) ? (
              <img src={getFilePreviewUrl(previewFile)} alt={previewFile.name} />
            ) : isPdf(previewFile) ? (
              <iframe src={`${getFilePreviewUrl(previewFile)}#toolbar=0`} title={previewFile.name} />
            ) : (
              <p>Preview not available for this file type.</p>
            )}
            <div className="file-preview-filename">{previewFile.name}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
